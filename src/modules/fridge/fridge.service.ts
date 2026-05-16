import { HttpStatus, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { PrismaService } from '@/database/prisma.service'
import { DEFAULT_STORAGE_SHELVES } from './fridge.constants'
import type { CreateFridgeDto } from './dto/create-fridge.dto'
import type { CreateStorageShelfDto } from './dto/create-storage-shelf.dto'
import type { UpdateFridgeDto } from './dto/update-fridge.dto'
import type { UpdateStorageShelfDto } from './dto/update-storage-shelf.dto'

/**
 * 所有写/读冰箱与层位的接口现在都要求 userId（来自 JWT @CurrentUser）。
 *
 * 设计原则：
 *  - list/create 直接接 userId 参数（service 层签名清晰，不依赖请求上下文）
 *  - update/remove/listShelves/... 内部统一过 ensureFridgeOwnedByUser，
 *    拒绝跨用户访问 → 抛 FORBIDDEN，前端 toast 「无权访问」
 *  - ensureFridgeOwnedByUser 是公开方法（exports 给 FoodModule / RecipeSuggestionModule 用）
 */
@Injectable()
export class FridgeService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.fridge.findMany({
      where: { userId },
      include: {
        shelves: {
          orderBy: [{ area: 'asc' }, { sort: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async create(data: CreateFridgeDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const fridge = await tx.fridge.create({ data: { ...data, userId } })
      await this.createMissingDefaultShelves(fridge.id, tx)

      return tx.fridge.findUniqueOrThrow({
        where: { id: fridge.id },
        include: {
          shelves: {
            orderBy: [{ area: 'asc' }, { sort: 'asc' }],
          },
        },
      })
    })
  }

  async getById(id: string, userId: string) {
    await this.ensureFridgeOwnedByUser(id, userId)
    const fridge = await this.prisma.fridge.findUnique({
      where: { id },
      include: {
        shelves: {
          orderBy: [{ area: 'asc' }, { sort: 'asc' }],
        },
      },
    })

    if (!fridge) {
      throw new BusinessException(ErrorCode.FRIDGE_NOT_FOUND, '冰箱不存在', HttpStatus.NOT_FOUND)
    }

    return fridge
  }

  async update(id: string, data: UpdateFridgeDto, userId: string) {
    await this.ensureFridgeOwnedByUser(id, userId)

    return this.prisma.fridge.update({
      where: { id },
      data,
    })
  }

  async remove(id: string, userId: string) {
    await this.ensureFridgeOwnedByUser(id, userId)

    return this.prisma.fridge.delete({
      where: { id },
    })
  }

  async listShelves(fridgeId: string, userId: string) {
    await this.ensureFridgeOwnedByUser(fridgeId, userId)

    return this.prisma.storageShelf.findMany({
      where: { fridgeId },
      orderBy: [{ area: 'asc' }, { sort: 'asc' }],
    })
  }

  async createShelf(fridgeId: string, data: CreateStorageShelfDto, userId: string) {
    await this.ensureFridgeOwnedByUser(fridgeId, userId)

    try {
      return await this.prisma.storageShelf.create({
        data: {
          ...data,
          fridgeId,
        },
      })
    }
    catch (error) {
      this.throwConflictIfUniqueShelf(error)
      throw error
    }
  }

  async resetDefaultShelves(fridgeId: string, userId: string) {
    await this.ensureFridgeOwnedByUser(fridgeId, userId)

    return this.prisma.$transaction(async (tx) => {
      await this.createMissingDefaultShelves(fridgeId, tx)

      return tx.storageShelf.findMany({
        where: { fridgeId },
        orderBy: [{ area: 'asc' }, { sort: 'asc' }],
      })
    })
  }

  async getShelf(fridgeId: string, shelfId: string, userId: string) {
    await this.ensureFridgeOwnedByUser(fridgeId, userId)
    return this.ensureShelfBelongsToFridge(fridgeId, shelfId)
  }

  async updateShelf(fridgeId: string, shelfId: string, data: UpdateStorageShelfDto, userId: string) {
    await this.ensureFridgeOwnedByUser(fridgeId, userId)
    await this.ensureShelfBelongsToFridge(fridgeId, shelfId)

    try {
      return await this.prisma.storageShelf.update({
        where: { id: shelfId },
        data,
      })
    }
    catch (error) {
      this.throwConflictIfUniqueShelf(error)
      throw error
    }
  }

  async removeShelf(fridgeId: string, shelfId: string, userId: string) {
    await this.ensureFridgeOwnedByUser(fridgeId, userId)
    await this.ensureShelfBelongsToFridge(fridgeId, shelfId)

    const foodCount = await this.prisma.foodItem.count({
      where: { shelfId },
    })

    if (foodCount > 0) {
      throw new BusinessException(ErrorCode.CONFLICT, '层位下还有食材，不能直接删除', HttpStatus.CONFLICT)
    }

    return this.prisma.storageShelf.delete({
      where: { id: shelfId },
    })
  }

  /**
   * 鉴权关键 utility：冰箱不存在抛 404，不属于当前用户抛 403。
   * 公开给 FoodService / RecipeSuggestionService 使用（FridgeModule.exports 中暴露 FridgeService）。
   *
   * 不区分「不存在」和「无权访问」对外返回——避免被穷举 fridgeId 试探别人的资产，
   * 但 status code 还是按语义分（404 vs 403），方便日志排查。
   */
  async ensureFridgeOwnedByUser(fridgeId: string, userId: string) {
    const fridge = await this.prisma.fridge.findUnique({
      where: { id: fridgeId },
      select: { id: true, userId: true },
    })

    if (!fridge) {
      throw new BusinessException(ErrorCode.FRIDGE_NOT_FOUND, '冰箱不存在', HttpStatus.NOT_FOUND)
    }
    if (fridge.userId !== userId) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '无权访问该冰箱', HttpStatus.FORBIDDEN)
    }
  }

  async ensureShelfBelongsToFridge(fridgeId: string, shelfId: string) {
    const shelf = await this.prisma.storageShelf.findUnique({
      where: { id: shelfId },
    })

    if (!shelf || shelf.fridgeId !== fridgeId) {
      throw new BusinessException(ErrorCode.STORAGE_SHELF_NOT_FOUND, '冰箱层位不存在', HttpStatus.NOT_FOUND)
    }

    return shelf
  }

  private async createMissingDefaultShelves(fridgeId: string, tx: Prisma.TransactionClient) {
    const existingShelves = await tx.storageShelf.findMany({
      where: { fridgeId },
      select: { area: true, name: true },
    })
    const existingKeys = new Set(existingShelves.map((shelf) => `${shelf.area}:${shelf.name}`))
    const missingShelves = DEFAULT_STORAGE_SHELVES.filter((shelf) => !existingKeys.has(`${shelf.area}:${shelf.name}`))

    if (missingShelves.length === 0) {
      return
    }

    await tx.storageShelf.createMany({
      data: missingShelves.map((shelf) => ({ ...shelf, fridgeId })),
      skipDuplicates: true,
    })
  }

  private throwConflictIfUniqueShelf(error: unknown) {
    if (this.isPrismaUniqueConstraintError(error)) {
      throw new BusinessException(ErrorCode.CONFLICT, '同一冰箱下已存在相同层位', HttpStatus.CONFLICT)
    }
  }

  private isPrismaUniqueConstraintError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
  }
}
