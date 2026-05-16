import { HttpStatus } from '@nestjs/common'
import { StorageArea } from '@prisma/client'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { DEFAULT_STORAGE_SHELVES } from './fridge.constants'
import { FridgeService } from './fridge.service'

describe('FridgeService', () => {
  it('creates default shelves when creating fridge', async () => {
    const tx = {
      fridge: {
        create: jest.fn().mockResolvedValue({ id: 'fridge_1', name: '家用冰箱', userId: 'user_1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'fridge_1', shelves: DEFAULT_STORAGE_SHELVES }),
      },
      storageShelf: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: DEFAULT_STORAGE_SHELVES.length }),
      },
    }
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
    }
    const service = new FridgeService(prisma as never)

    await expect(service.create({ name: '家用冰箱' }, 'user_1')).resolves.toEqual({ id: 'fridge_1', shelves: DEFAULT_STORAGE_SHELVES })
    expect(tx.fridge.create).toHaveBeenCalledWith({ data: { name: '家用冰箱', userId: 'user_1' } })
    expect(tx.storageShelf.createMany).toHaveBeenCalledWith({
      data: DEFAULT_STORAGE_SHELVES.map((shelf) => ({ ...shelf, fridgeId: 'fridge_1' })),
      skipDuplicates: true,
    })
  })

  it('ensureFridgeOwnedByUser throws NOT_FOUND when fridge missing', async () => {
    const prisma = {
      fridge: { findUnique: jest.fn().mockResolvedValue(null) },
    }
    const service = new FridgeService(prisma as never)

    await expect(service.ensureFridgeOwnedByUser('missing', 'user_1')).rejects.toMatchObject({
      response: '冰箱不存在',
      status: HttpStatus.NOT_FOUND,
    })
  })

  it('ensureFridgeOwnedByUser throws FORBIDDEN when fridge belongs to another user', async () => {
    const prisma = {
      fridge: { findUnique: jest.fn().mockResolvedValue({ id: 'fridge_1', userId: 'user_other' }) },
    }
    const service = new FridgeService(prisma as never)

    await expect(service.ensureFridgeOwnedByUser('fridge_1', 'user_1')).rejects.toMatchObject({
      response: '无权访问该冰箱',
      status: HttpStatus.FORBIDDEN,
    })
  })

  it('reset default shelves only creates missing defaults', async () => {
    const existingShelf = { area: StorageArea.door, name: '门架' }
    const tx = {
      storageShelf: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([existingShelf])
          .mockResolvedValueOnce([{ id: 'shelf_1' }]),
        createMany: jest.fn().mockResolvedValue({ count: DEFAULT_STORAGE_SHELVES.length - 1 }),
      },
    }
    const prisma = {
      fridge: { findUnique: jest.fn().mockResolvedValue({ id: 'fridge_1', userId: 'user_1' }) },
      $transaction: jest.fn().mockImplementation((callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
    }
    const service = new FridgeService(prisma as never)

    await service.resetDefaultShelves('fridge_1', 'user_1')

    expect(tx.storageShelf.createMany).toHaveBeenCalledWith({
      data: DEFAULT_STORAGE_SHELVES.filter((shelf) => !(shelf.area === existingShelf.area && shelf.name === existingShelf.name)).map((shelf) => ({ ...shelf, fridgeId: 'fridge_1' })),
      skipDuplicates: true,
    })
  })

  it('rejects shelf lookup when shelf belongs to another fridge', async () => {
    const prisma = {
      fridge: { findUnique: jest.fn().mockResolvedValue({ id: 'fridge_1', userId: 'user_1' }) },
      storageShelf: { findUnique: jest.fn().mockResolvedValue({ id: 'shelf_1', fridgeId: 'fridge_2' }) },
    }
    const service = new FridgeService(prisma as never)

    await expect(service.getShelf('fridge_1', 'shelf_1', 'user_1')).rejects.toMatchObject({
      response: '冰箱层位不存在',
      status: HttpStatus.NOT_FOUND,
    })
  })

  it('rejects deleting shelf that still contains food', async () => {
    const prisma = {
      fridge: { findUnique: jest.fn().mockResolvedValue({ id: 'fridge_1', userId: 'user_1' }) },
      storageShelf: { findUnique: jest.fn().mockResolvedValue({ id: 'shelf_1', fridgeId: 'fridge_1' }) },
      foodItem: { count: jest.fn().mockResolvedValue(1) },
    }
    const service = new FridgeService(prisma as never)

    await expect(service.removeShelf('fridge_1', 'shelf_1', 'user_1')).rejects.toMatchObject({
      response: '层位下还有食材，不能直接删除',
      status: HttpStatus.CONFLICT,
    })
  })

  it('throws BusinessException with conflict code for duplicate shelf', async () => {
    const prisma = {
      fridge: { findUnique: jest.fn().mockResolvedValue({ id: 'fridge_1', userId: 'user_1' }) },
      storageShelf: {
        create: jest.fn().mockRejectedValue({ code: 'P2002', clientVersion: 'test' }),
      },
    }
    const service = new FridgeService(prisma as never)

    await expect(service.createShelf('fridge_1', { area: 'fridge', name: '第 1 层', sort: 1 }, 'user_1')).rejects.toBeInstanceOf(BusinessException)
    await expect(service.createShelf('fridge_1', { area: 'fridge', name: '第 1 层', sort: 1 }, 'user_1')).rejects.toHaveProperty('errorCode', ErrorCode.CONFLICT)
  })
})
