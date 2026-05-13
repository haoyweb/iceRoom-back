import { HttpStatus } from '@nestjs/common'
import { ExpireDateSource, FoodStatus, Prisma, StorageArea } from '@prisma/client'
import { FoodService } from './food.service'

describe('FoodService', () => {
  it('marks expired food by expire date', async () => {
    const prisma = {
      foodItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'food_1',
            expireDate: new Date('2020-01-01T00:00:00.000Z'),
          },
        ]),
      },
    }
    const service = new FoodService(prisma as never)

    await expect(service.listExpiring({})).resolves.toEqual([
      expect.objectContaining({
        id: 'food_1',
        expiryLevel: 'expired',
      }),
    ])
  })

  it('auto-calculates expire date when expireDate is omitted', async () => {
    let createArg: { data: { expireDate: Date, expireDateSource: ExpireDateSource } } | undefined
    const prisma = {
      fridge: { findUnique: jest.fn().mockResolvedValue({ id: 'fridge_1' }) },
      storageShelf: { findUnique: jest.fn().mockResolvedValue({ id: 'shelf_1', fridgeId: 'fridge_1', area: StorageArea.fridge }) },
      foodItem: {
        create: jest.fn().mockImplementation((arg: typeof createArg) => {
          createArg = arg
          return Promise.resolve({ id: 'food_1', expireDate: arg?.data.expireDate ?? new Date(), expireDateSource: arg?.data.expireDateSource })
        }),
      },
    }
    const service = new FoodService(prisma as never)

    await service.create({
      name: '番茄',
      category: 'vegetable',
      fridgeId: 'fridge_1',
      shelfId: 'shelf_1',
      purchaseDate: '2026-05-12T00:00:00.000Z',
    })

    expect(createArg?.data.expireDateSource).toBe(ExpireDateSource.auto)
    expect(createArg?.data.expireDate).toBeInstanceOf(Date)
  })

  it('keeps manual expire date when provided', async () => {
    let createArg: { data: { expireDate: Date, expireDateSource: ExpireDateSource } } | undefined
    const manualExpireDate = '2026-05-15T00:00:00.000Z'
    const prisma = {
      fridge: { findUnique: jest.fn().mockResolvedValue({ id: 'fridge_1' }) },
      storageShelf: { findUnique: jest.fn().mockResolvedValue({ id: 'shelf_1', fridgeId: 'fridge_1', area: StorageArea.fridge }) },
      foodItem: {
        create: jest.fn().mockImplementation((arg: typeof createArg) => {
          createArg = arg
          return Promise.resolve({ id: 'food_1', expireDate: arg?.data.expireDate ?? new Date(), expireDateSource: arg?.data.expireDateSource })
        }),
      },
    }
    const service = new FoodService(prisma as never)

    await service.create({
      name: '番茄',
      category: 'vegetable',
      fridgeId: 'fridge_1',
      shelfId: 'shelf_1',
      expireDate: manualExpireDate,
    })

    expect(createArg?.data.expireDateSource).toBe(ExpireDateSource.manual)
    expect(createArg?.data.expireDate.toISOString()).toBe(manualExpireDate)
  })

  it('rejects food creation when shelf belongs to another fridge', async () => {
    const prisma = {
      fridge: { findUnique: jest.fn().mockResolvedValue({ id: 'fridge_1' }) },
      storageShelf: { findUnique: jest.fn().mockResolvedValue({ id: 'shelf_1', fridgeId: 'fridge_2' }) },
    }
    const service = new FoodService(prisma as never)

    await expect(
      service.create({
        name: '番茄',
        category: 'vegetable',
        fridgeId: 'fridge_1',
        shelfId: 'shelf_1',
        expireDate: '2026-05-15T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      response: '食材层位不属于当前冰箱',
      status: HttpStatus.BAD_REQUEST,
    })
  })

  it('updates food status after ensuring food exists', async () => {
    const expireDate = new Date('2099-01-01T00:00:00.000Z')
    const prisma = {
      foodItem: {
        findUnique: jest.fn().mockResolvedValue({ id: 'food_1', fridgeId: 'fridge_1', shelfId: 'shelf_1' }),
        update: jest.fn().mockResolvedValue({ id: 'food_1', status: FoodStatus.consumed, expireDate }),
      },
    }
    const service = new FoodService(prisma as never)

    await expect(service.updateStatus('food_1', { status: FoodStatus.consumed })).resolves.toEqual(
      expect.objectContaining({ id: 'food_1', status: FoodStatus.consumed }),
    )
    expect(prisma.foodItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: FoodStatus.consumed } }))
  })

  it('consumes quantity and marks food consumed when quantity reaches zero', async () => {
    const tx = {
      foodItem: {
        findUnique: jest.fn().mockResolvedValue({ id: 'food_1', name: '番茄', quantity: new Prisma.Decimal(1), status: FoodStatus.normal, unit: '个' }),
        update: jest.fn().mockResolvedValue({ id: 'food_1', quantity: new Prisma.Decimal(0), status: FoodStatus.consumed, unit: '个' }),
      },
    }
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
    }
    const service = new FoodService(prisma as never)

    await expect(service.consumeBatch({ recipeName: '番茄炒蛋', items: [{ foodId: 'food_1', quantity: 1 }] })).resolves.toEqual({
      recipeName: '番茄炒蛋',
      items: [
        {
          foodId: 'food_1',
          name: '番茄',
          previousQuantity: 1,
          consumedQuantity: 1,
          remainingQuantity: 0,
          status: FoodStatus.consumed,
          unit: '个',
        },
      ],
    })
  })

  it('rejects consuming more than current quantity', async () => {
    const tx = {
      foodItem: {
        findUnique: jest.fn().mockResolvedValue({ id: 'food_1', name: '番茄', quantity: new Prisma.Decimal(1), status: FoodStatus.normal, unit: '个' }),
      },
    }
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
    }
    const service = new FoodService(prisma as never)

    await expect(service.consumeBatch({ items: [{ foodId: 'food_1', quantity: 2 }] })).rejects.toMatchObject({
      response: '扣减数量不能超过当前库存',
      status: HttpStatus.BAD_REQUEST,
    })
  })

  it('rejects partial consumption for food without quantity', async () => {
    const tx = {
      foodItem: {
        findUnique: jest.fn().mockResolvedValue({ id: 'food_1', name: '盐', quantity: null, status: FoodStatus.normal, unit: null }),
      },
    }
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
    }
    const service = new FoodService(prisma as never)

    await expect(service.consumeBatch({ items: [{ foodId: 'food_1', quantity: 1 }] })).rejects.toMatchObject({
      response: '没有数量的食材不能部分扣减',
      status: HttpStatus.BAD_REQUEST,
    })
  })

  it('passes configurable expiring query to Prisma', async () => {
    let findManyArg: { where: { expireDate: { gte: Date, lte: Date }, fridgeId: string, status: FoodStatus } } | undefined
    const prisma = {
      fridge: { findUnique: jest.fn().mockResolvedValue({ id: 'fridge_1' }) },
      foodItem: {
        findMany: jest.fn().mockImplementation((arg: typeof findManyArg) => {
          findManyArg = arg
          return Promise.resolve([])
        }),
      },
    }
    const service = new FoodService(prisma as never)

    await service.listExpiring({ fridgeId: 'fridge_1', days: 3, includeExpired: false })

    expect(findManyArg?.where.fridgeId).toBe('fridge_1')
    expect(findManyArg?.where.status).toBe(FoodStatus.normal)
    expect(findManyArg?.where.expireDate.gte).toBeInstanceOf(Date)
    expect(findManyArg?.where.expireDate.lte).toBeInstanceOf(Date)
  })
})
