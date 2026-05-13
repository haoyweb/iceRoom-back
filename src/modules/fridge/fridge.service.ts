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

@Injectable()
export class FridgeService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId?: string) {
    return this.prisma.fridge.findMany({
      where: userId ? { userId } : undefined,
      include: {
        shelves: {
          orderBy: [{ area: 'asc' }, { sort: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async create(data: CreateFridgeDto) {
    await this.ensureUserExists(data.userId)

    return this.prisma.$transaction(async (tx) => {
      const fridge = await tx.fridge.create({ data })
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

  async getById(id: string) {
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

  async update(id: string, data: UpdateFridgeDto) {
    await this.ensureFridgeExists(id)

    return this.prisma.fridge.update({
      where: { id },
      data,
    })
  }

  async remove(id: string) {
    await this.ensureFridgeExists(id)

    return this.prisma.fridge.delete({
      where: { id },
    })
  }

  async listShelves(fridgeId: string) {
    await this.ensureFridgeExists(fridgeId)

    return this.prisma.storageShelf.findMany({
      where: { fridgeId },
      orderBy: [{ area: 'asc' }, { sort: 'asc' }],
    })
  }

  async createShelf(fridgeId: string, data: CreateStorageShelfDto) {
    await this.ensureFridgeExists(fridgeId)

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

  async resetDefaultShelves(fridgeId: string) {
    await this.ensureFridgeExists(fridgeId)

    return this.prisma.$transaction(async (tx) => {
      await this.createMissingDefaultShelves(fridgeId, tx)

      return tx.storageShelf.findMany({
        where: { fridgeId },
        orderBy: [{ area: 'asc' }, { sort: 'asc' }],
      })
    })
  }

  async getShelf(fridgeId: string, shelfId: string) {
    await this.ensureFridgeExists(fridgeId)
    return this.ensureShelfBelongsToFridge(fridgeId, shelfId)
  }

  async updateShelf(fridgeId: string, shelfId: string, data: UpdateStorageShelfDto) {
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

  async removeShelf(fridgeId: string, shelfId: string) {
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

  async ensureFridgeExists(id: string) {
    const fridge = await this.prisma.fridge.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!fridge) {
      throw new BusinessException(ErrorCode.FRIDGE_NOT_FOUND, '冰箱不存在', HttpStatus.NOT_FOUND)
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

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })

    if (!user) {
      throw new BusinessException(ErrorCode.USER_NOT_FOUND, '用户不存在', HttpStatus.NOT_FOUND)
    }
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
