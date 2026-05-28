import { HttpStatus, Injectable } from '@nestjs/common'
import { ExpireDateSource, FoodStatus, Prisma, StorageArea } from '@prisma/client'
import { createPageResult } from '@/common/dto/page.dto'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { withExpiryInfo } from '@/common/utils/expiry'
import { PrismaService } from '@/database/prisma.service'
import { FridgeService } from '../fridge/fridge.service'
import { calculateExpireDate, getFreshnessDays } from './food-freshness.constants'
import { FoodReminderService } from './food-reminder.service'
import type { ConsumeFoodBatchDto } from './dto/consume-food-batch.dto'
import type { CreateFoodDto } from './dto/create-food.dto'
import type { ExpiringFoodQueryDto } from './dto/expiring-food-query.dto'
import type { FoodQueryDto } from './dto/food-query.dto'
import type { UpdateFoodStatusDto } from './dto/update-food-status.dto'
import type { UpdateFoodDto } from './dto/update-food.dto'

/**
 * 所有读/写接口都接 userId（来自 JWT）。鉴权策略：
 *  - 列表型接口（list、listExpiring）：where 子句强制带 `fridge: { userId }`，
 *    不传 fridgeId 时只返回该用户所有冰箱的食材；传了的话再叠加 fridgeId 过滤。
 *  - 单条写接口（update/updateStatus/remove）：先 fetch 食材的 fridgeId，
 *    然后调 fridgeService.ensureFridgeOwnedByUser(fridgeId, userId) 校验。
 *  - create：body 带 fridgeId/shelfId，必须先校验 fridge 归属。
 *  - consumeBatch：批量 fetch 然后批量校验，确保任何一条不属于用户就拒。
 */
@Injectable()
export class FoodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fridgeService: FridgeService,
  ) {}

  async list(query: FoodQueryDto, userId: string) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    // 关联过滤：fridge.userId = 当前用户。fridgeId 可选叠加。
    const where: Prisma.FoodItemWhereInput = {
      fridge: { userId },
      ...(query.fridgeId ? { fridgeId: query.fridgeId } : {}),
      category: query.category,
      status: query.status,
    }

    const [list, total] = await Promise.all([
      this.prisma.foodItem.findMany({
        where,
        include: { shelf: true },
        orderBy: [{ expireDate: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.foodItem.count({ where }),
    ])

    return createPageResult(list.map((item) => this.withExpiryLevel(item)), total, page, pageSize)
  }

  async getById(id: string, userId: string) {
    const food = await this.prisma.foodItem.findUnique({
      where: { id },
      include: { shelf: true, fridge: true },
    })

    if (!food) {
      throw new BusinessException(ErrorCode.FOOD_NOT_FOUND, '食材不存在', HttpStatus.NOT_FOUND)
    }

    if (food.fridge.userId !== userId) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '无权访问该食材', HttpStatus.FORBIDDEN)
    }

    return this.withExpiryLevel(food)
  }

  async create(data: CreateFoodDto, userId: string) {
    await this.fridgeService.ensureFridgeOwnedByUser(data.fridgeId, userId)
    const shelf = await this.ensureShelfBelongsToFridge(data.fridgeId, data.shelfId)

    const food = await this.prisma.foodItem.create({
      data: this.toFoodCreateInput(data, shelf.area),
      include: { shelf: true },
    })

    return this.withExpiryLevel(food)
  }

  async update(id: string, data: UpdateFoodDto, userId: string) {
    const current = await this.ensureFoodExistsForUser(id, userId)
    const fridgeId = data.fridgeId ?? current.fridgeId
    const shelfId = data.shelfId ?? current.shelfId

    // 如果改了 fridgeId 指向别人的冰箱（理论上前端不该这么做但兜底），同样要校验
    if (data.fridgeId && data.fridgeId !== current.fridgeId) {
      await this.fridgeService.ensureFridgeOwnedByUser(data.fridgeId, userId)
    }

    const shelf = await this.ensureShelfBelongsToFridge(fridgeId, shelfId)

    const food = await this.prisma.foodItem.update({
      where: { id },
      data: this.toFoodUpdateInput(data, current, shelf.area),
      include: { shelf: true },
    })

    return this.withExpiryLevel(food)
  }

  async updateStatus(id: string, data: UpdateFoodStatusDto, userId: string) {
    await this.ensureFoodExistsForUser(id, userId)

    const food = await this.prisma.foodItem.update({
      where: { id },
      data: { status: data.status },
      include: { shelf: true },
    })

    return this.withExpiryLevel(food)
  }

  async consumeBatch(data: ConsumeFoodBatchDto, userId: string) {
    const foodIds = data.items.map((item) => item.foodId)
    if (new Set(foodIds).size !== foodIds.length) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '扣减列表中存在重复的食材', HttpStatus.BAD_REQUEST)
    }

    return this.prisma.$transaction(async (tx) => {
      const foods = await tx.foodItem.findMany({
        where: { id: { in: foodIds } },
        select: {
          id: true,
          name: true,
          quantity: true,
          status: true,
          unit: true,
          // 把 fridge.userId 一起拉出来做权限校验，避免再做一轮 RTT
          fridge: { select: { userId: true } },
        },
      })

      // 任何一条不属于当前用户 → 整批拒，避免用户用合法的食材 ID 跟自己的食材一起夹带别人的
      for (const food of foods) {
        if (food.fridge.userId !== userId) {
          throw new BusinessException(ErrorCode.FORBIDDEN, '无权操作该食材', HttpStatus.FORBIDDEN)
        }
      }

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

  async remove(id: string, userId: string) {
    await this.ensureFoodExistsForUser(id, userId)

    return this.prisma.foodItem.delete({
      where: { id },
    })
  }

  async listExpiring(query: ExpiringFoodQueryDto, userId: string) {
    const days = query.days ?? 7
    const includeExpired = query.includeExpired ?? true
    const status = query.status ?? FoodStatus.normal
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 100
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    end.setDate(end.getDate() + days)

    if (query.fridgeId) {
      await this.fridgeService.ensureFridgeOwnedByUser(query.fridgeId, userId)
    }

    // 过滤被「忽略 / 延后中」的食材：用户对该食材有 ignore，或 snooze 未到期，
    // 都从临期列表里隐去。判定逻辑统一封在 FoodReminderService.buildActiveReminderFilter。
    const where: Prisma.FoodItemWhereInput = {
      fridge: { userId },
      ...(query.fridgeId ? { fridgeId: query.fridgeId } : {}),
      status,
      expireDate: {
        ...(includeExpired ? {} : { gte: this.startOfToday() }),
        lte: end,
      },
      NOT: {
        reminders: {
          some: FoodReminderService.buildActiveReminderFilter(userId),
        },
      },
    }

    const [list, total] = await Promise.all([
      this.prisma.foodItem.findMany({
        where,
        include: { shelf: true },
        orderBy: [{ expireDate: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.foodItem.count({ where }),
    ])

    return createPageResult(list.map((item) => this.withExpiryLevel(item)), total, page, pageSize)
  }

  /**
   * 取食材并保证属于当前用户。读 fridge.userId 一并校验，省一次 RTT。
   * 返回字段集与原 ensureFoodExists 保持一致，调用方无需改逻辑。
   */
  async ensureFoodExistsForUser(id: string, userId: string) {
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
        fridge: { select: { userId: true } },
      },
    })

    if (!food) {
      throw new BusinessException(ErrorCode.FOOD_NOT_FOUND, '食材不存在', HttpStatus.NOT_FOUND)
    }

    if (food.fridge.userId !== userId) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '无权访问该食材', HttpStatus.FORBIDDEN)
    }

    return food
  }

  private async ensureShelfBelongsToFridge(fridgeId: string, shelfId: string) {
    const shelf = await this.prisma.storageShelf.findUnique({
      where: { id: shelfId },
      select: { id: true, fridgeId: true, area: true },
    })

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
