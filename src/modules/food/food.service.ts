import { HttpStatus, Injectable } from '@nestjs/common'
import { ExpireDateSource, FoodStatus, Prisma, StorageArea } from '@prisma/client'
import { createPageResult } from '@/common/dto/page.dto'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { withExpiryInfo } from '@/common/utils/expiry'
import { PrismaService } from '@/database/prisma.service'
import { calculateExpireDate, getFreshnessDays } from './food-freshness.constants'
import type { ConsumeFoodBatchDto } from './dto/consume-food-batch.dto'
import type { CreateFoodDto } from './dto/create-food.dto'
import type { ExpiringFoodQueryDto } from './dto/expiring-food-query.dto'
import type { FoodQueryDto } from './dto/food-query.dto'
import type { UpdateFoodStatusDto } from './dto/update-food-status.dto'
import type { UpdateFoodDto } from './dto/update-food.dto'

@Injectable()
export class FoodService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: FoodQueryDto) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const where: Prisma.FoodItemWhereInput = {
      fridgeId: query.fridgeId,
      category: query.category,
      status: query.status,
    }

    const [list, total] = await Promise.all([
      this.prisma.foodItem.findMany({
        where,
        include: { shelf: true },
        orderBy: { expireDate: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.foodItem.count({ where }),
    ])

    return createPageResult(list.map((item) => this.withExpiryLevel(item)), total, page, pageSize)
  }

  async getById(id: string) {
    const food = await this.prisma.foodItem.findUnique({
      where: { id },
      include: { shelf: true, fridge: true },
    })

    if (!food) {
      throw new BusinessException(ErrorCode.FOOD_NOT_FOUND, '食材不存在', HttpStatus.NOT_FOUND)
    }

    return this.withExpiryLevel(food)
  }

  async create(data: CreateFoodDto) {
    const shelf = await this.ensureShelfBelongsToFridge(data.fridgeId, data.shelfId)

    const food = await this.prisma.foodItem.create({
      data: this.toFoodCreateInput(data, shelf.area),
      include: { shelf: true },
    })

    return this.withExpiryLevel(food)
  }

  async update(id: string, data: UpdateFoodDto) {
    const current = await this.ensureFoodExists(id)
    const fridgeId = data.fridgeId ?? current.fridgeId
    const shelfId = data.shelfId ?? current.shelfId

    const shelf = await this.ensureShelfBelongsToFridge(fridgeId, shelfId)

    const food = await this.prisma.foodItem.update({
      where: { id },
      data: this.toFoodUpdateInput(data, current, shelf.area),
      include: { shelf: true },
    })

    return this.withExpiryLevel(food)
  }

  async updateStatus(id: string, data: UpdateFoodStatusDto) {
    await this.ensureFoodExists(id)

    const food = await this.prisma.foodItem.update({
      where: { id },
      data: { status: data.status },
      include: { shelf: true },
    })

    return this.withExpiryLevel(food)
  }

  async consumeBatch(data: ConsumeFoodBatchDto) {
    const foodIds = data.items.map((item) => item.foodId)
    if (new Set(foodIds).size !== foodIds.length) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '扣减列表中存在重复的食材', HttpStatus.BAD_REQUEST)
    }

    return this.prisma.$transaction(async (tx) => {
      const foods = await tx.foodItem.findMany({
        where: { id: { in: foodIds } },
        select: { id: true, name: true, quantity: true, status: true, unit: true },
      })
      const foodMap = new Map(foods.map((food) => [food.id, food]))

      const plans = data.items.map((item) => {
        const food = foodMap.get(item.foodId)
        if (!food) {
          throw new BusinessException(ErrorCode.FOOD_NOT_FOUND, '食材不存在', HttpStatus.NOT_FOUND)
        }
        if (food.status !== FoodStatus.normal) {
          throw new BusinessException(ErrorCode.BAD_REQUEST, '只能扣减正常状态的食材', HttpStatus.BAD_REQUEST)
        }
        if (!food.quantity) {
          throw new BusinessException(ErrorCode.BAD_REQUEST, '没有数量的食材不能部分扣减', HttpStatus.BAD_REQUEST)
        }

        const currentQuantity = new Prisma.Decimal(food.quantity)
        const consumedQuantity = new Prisma.Decimal(item.quantity)
        if (currentQuantity.lt(consumedQuantity)) {
          throw new BusinessException(ErrorCode.BAD_REQUEST, '扣减数量不能超过当前库存', HttpStatus.BAD_REQUEST)
        }

        const remainingQuantity = currentQuantity.minus(consumedQuantity)
        const status = remainingQuantity.equals(0) ? FoodStatus.consumed : FoodStatus.normal

        return {
          foodId: item.foodId,
          name: food.name,
          currentQuantity,
          consumedQuantity,
          remainingQuantity,
          status,
        }
      })

      const results = await Promise.all(
        plans.map(async (plan) => {
          const updated = await tx.foodItem.update({
            where: { id: plan.foodId },
            data: { quantity: plan.remainingQuantity, status: plan.status },
            select: { id: true, status: true, unit: true },
          })
          return {
            foodId: updated.id,
            name: plan.name,
            previousQuantity: plan.currentQuantity.toNumber(),
            consumedQuantity: plan.consumedQuantity.toNumber(),
            remainingQuantity: plan.remainingQuantity.toNumber(),
            status: updated.status,
            unit: updated.unit,
          }
        }),
      )

      return {
        recipeName: data.recipeName ?? null,
        items: results,
      }
    })
  }

  async remove(id: string) {
    await this.ensureFoodExists(id)

    return this.prisma.foodItem.delete({
      where: { id },
    })
  }

  async listExpiring(query: ExpiringFoodQueryDto) {
    const days = query.days ?? 7
    const includeExpired = query.includeExpired ?? true
    const status = query.status ?? FoodStatus.normal
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 100
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    end.setDate(end.getDate() + days)

    if (query.fridgeId) {
      await this.ensureFridgeExists(query.fridgeId)
    }

    const where: Prisma.FoodItemWhereInput = {
      fridgeId: query.fridgeId,
      status,
      expireDate: {
        ...(includeExpired ? {} : { gte: this.startOfToday() }),
        lte: end,
      },
    }

    const [list, total] = await Promise.all([
      this.prisma.foodItem.findMany({
        where,
        include: { shelf: true },
        orderBy: { expireDate: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.foodItem.count({ where }),
    ])

    return createPageResult(list.map((item) => this.withExpiryLevel(item)), total, page, pageSize)
  }

  async ensureFoodExists(id: string) {
    const food = await this.prisma.foodItem.findUnique({
      where: { id },
      select: {
        id: true,
        fridgeId: true,
        shelfId: true,
        name: true,
        category: true,
        purchaseDate: true,
        expireDateSource: true,
      },
    })

    if (!food) {
      throw new BusinessException(ErrorCode.FOOD_NOT_FOUND, '食材不存在', HttpStatus.NOT_FOUND)
    }

    return food
  }

  private async ensureFridgeExists(fridgeId: string) {
    const fridge = await this.prisma.fridge.findUnique({
      where: { id: fridgeId },
      select: { id: true },
    })

    if (!fridge) {
      throw new BusinessException(ErrorCode.FRIDGE_NOT_FOUND, '冰箱不存在', HttpStatus.NOT_FOUND)
    }
  }

  private async ensureShelfBelongsToFridge(fridgeId: string, shelfId: string) {
    // 两个查询独立，可并行减少一次 RTT。Promise.all 在任一抛错时直接 reject，
    // 行为与原串行版本一致。
    const [, shelf] = await Promise.all([
      this.ensureFridgeExists(fridgeId),
      this.prisma.storageShelf.findUnique({
        where: { id: shelfId },
        select: { id: true, fridgeId: true, area: true },
      }),
    ])

    if (!shelf) {
      throw new BusinessException(ErrorCode.STORAGE_SHELF_NOT_FOUND, '冰箱层位不存在', HttpStatus.NOT_FOUND)
    }

    if (shelf.fridgeId !== fridgeId) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '食材层位不属于当前冰箱', HttpStatus.BAD_REQUEST)
    }

    return shelf
  }

  private toFoodCreateInput(data: CreateFoodDto, storageArea: Parameters<typeof getFreshnessDays>[2]): Prisma.FoodItemUncheckedCreateInput {
    const purchaseDate = data.purchaseDate ? new Date(data.purchaseDate) : undefined
    const expireDateSource = data.expireDate ? ExpireDateSource.manual : ExpireDateSource.auto
    const expireDate = data.expireDate
      ? new Date(data.expireDate)
      : calculateExpireDate(purchaseDate ?? new Date(), getFreshnessDays(data.name, data.category, storageArea))

    return {
      ...data,
      quantity: data.quantity === undefined ? undefined : new Prisma.Decimal(data.quantity),
      purchaseDate,
      expireDate,
      expireDateSource,
    }
  }

  private toFoodUpdateInput(
    data: UpdateFoodDto,
    current: { name: string, category: Prisma.FoodItemUncheckedUpdateInput['category'], purchaseDate: Date | null, expireDateSource: ExpireDateSource },
    storageArea: StorageArea,
  ): Prisma.FoodItemUncheckedUpdateInput {
    const result: Prisma.FoodItemUncheckedUpdateInput = {
      ...data,
      quantity: data.quantity === undefined ? undefined : new Prisma.Decimal(data.quantity),
      purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
    }

    if (data.expireDate) {
      result.expireDate = new Date(data.expireDate)
      result.expireDateSource = ExpireDateSource.manual
      return result
    }

    const affectsAutoEstimate = current.expireDateSource === ExpireDateSource.auto
      && (data.name !== undefined || data.category !== undefined || data.shelfId !== undefined || data.purchaseDate !== undefined)

    if (affectsAutoEstimate) {
      const name = data.name ?? current.name
      const category = data.category ?? (current.category as Parameters<typeof getFreshnessDays>[1])
      const purchaseDate = data.purchaseDate ? new Date(data.purchaseDate) : current.purchaseDate ?? new Date()
      result.expireDate = calculateExpireDate(purchaseDate, getFreshnessDays(name, category, storageArea))
      result.expireDateSource = ExpireDateSource.auto
    }

    return result
  }

  private withExpiryLevel<T extends { expireDate: Date }>(item: T) {
    return withExpiryInfo(item)
  }

  private startOfToday() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  }
}
