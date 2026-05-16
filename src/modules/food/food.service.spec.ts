import { HttpStatus } from '@nestjs/common'
import { ExpireDateSource, FoodStatus, Prisma, StorageArea } from '@prisma/client'
import { FoodService } from './food.service'

/**
 * B4 鉴权改造后 FoodService 构造函数变为 (prisma, fridgeService)；
 * 所有 service 方法签名末尾追加 userId 参数，service 内会用 fridgeService.ensureFridgeOwnedByUser 校验。
 * 测试侧 mock fridgeService.ensureFridgeOwnedByUser 直接放行（resolve()），
 * 然后断言行为/查询参数；ownership 拒绝路径由 fridge.service.spec 覆盖。
 */
const makeFridgeService = () => ({
  ensureFridgeOwnedByUser: jest.fn().mockResolvedValue(undefined),
})

const USER_ID = 'user_1'

describe('FoodService', () => {
  it('marks expired food by expire date', async () => {
    const findMany = jest.fn<Promise<Array<{ id: string, expireDate: Date }>>, [Prisma.FoodItemFindManyArgs]>().mockResolvedValue([
      { id: 'food_1', expireDate: new Date('2020-01-01T00:00:00.000Z') },
    ])
    const prisma = {
      foodItem: {
        findMany,
        count: jest.fn().mockResolvedValue(1),
      },
    }
    const service = new FoodService(prisma as never, makeFridgeService() as never)

    const result = await service.listExpiring({}, USER_ID)
    expect(result).toEqual(expect.objectContaining({
      total: 1,
      page: 1,
      pageSize: 100,
      list: [expect.objectContaining({ id: 'food_1', expiryLevel: 'expired' })],
    }))
    const findManyArg = findMany.mock.calls[0]?.[0]
    expect(findManyArg?.where).toEqual(expect.objectContaining({
      fridge: { userId: USER_ID },
      status: FoodStatus.normal,
    }))
  })

  it('auto-calculates expire date when expireDate is omitted', async () => {
    let createArg: { data: { expireDate: Date, expireDateSource: ExpireDateSource } } | undefined
    const prisma = {
      storageShelf: { findUnique: jest.fn().mockResolvedValue({ id: 'shelf_1', fridgeId: 'fridge_1', area: StorageArea.fridge }) },
      foodItem: {
        create: jest.fn().mockImplementation((arg: typeof createArg) => {
          createArg = arg
          return Promise.resolve({ id: 'food_1', expireDate: arg?.data.expireDate ?? new Date(), expireDateSource: arg?.data.expireDateSource })
        }),
      },
    }
    const service = new FoodService(prisma as never, makeFridgeService() as never)

    await service.create({
      name: '番茄',
      category: 'vegetable',
      fridgeId: 'fridge_1',
      shelfId: 'shelf_1',
      purchaseDate: '2026-05-12T00:00:00.000Z',
    }, USER_ID)

    expect(createArg?.data.expireDateSource).toBe(ExpireDateSource.auto)
    expect(createArg?.data.expireDate).toBeInstanceOf(Date)
  })

  it('keeps manual expire date when provided', async () => {
    let createArg: { data: { expireDate: Date, expireDateSource: ExpireDateSource } } | undefined
    const manualExpireDate = '2026-05-15T00:00:00.000Z'
    const prisma = {
      storageShelf: { findUnique: jest.fn().mockResolvedValue({ id: 'shelf_1', fridgeId: 'fridge_1', area: StorageArea.fridge }) },
      foodItem: {
        create: jest.fn().mockImplementation((arg: typeof createArg) => {
          createArg = arg
          return Promise.resolve({ id: 'food_1', expireDate: arg?.data.expireDate ?? new Date(), expireDateSource: arg?.data.expireDateSource })
        }),
      },
    }
    const service = new FoodService(prisma as never, makeFridgeService() as never)

    await service.create({
      name: '番茄',
      category: 'vegetable',
      fridgeId: 'fridge_1',
      shelfId: 'shelf_1',
      expireDate: manualExpireDate,
    }, USER_ID)

    expect(createArg?.data.expireDateSource).toBe(ExpireDateSource.manual)
    expect(createArg?.data.expireDate.toISOString()).toBe(manualExpireDate)
  })

  it('rejects food creation when shelf belongs to another fridge', async () => {
    const prisma = {
      storageShelf: { findUnique: jest.fn().mockResolvedValue({ id: 'shelf_1', fridgeId: 'fridge_2' }) },
    }
    const service = new FoodService(prisma as never, makeFridgeService() as never)

    await expect(
      service.create({
        name: '番茄',
        category: 'vegetable',
        fridgeId: 'fridge_1',
        shelfId: 'shelf_1',
        expireDate: '2026-05-15T00:00:00.000Z',
      }, USER_ID),
    ).rejects.toMatchObject({
      response: '食材层位不属于当前冰箱',
      status: HttpStatus.BAD_REQUEST,
    })
  })

  it('updates food status after ensuring ownership', async () => {
    const expireDate = new Date('2099-01-01T00:00:00.000Z')
    const prisma = {
      foodItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'food_1', fridgeId: 'fridge_1', shelfId: 'shelf_1',
          name: '番茄', category: 'vegetable', purchaseDate: null, expireDateSource: ExpireDateSource.manual,
          fridge: { userId: USER_ID },
        }),
        update: jest.fn().mockResolvedValue({ id: 'food_1', status: FoodStatus.consumed, expireDate }),
      },
    }
    const service = new FoodService(prisma as never, makeFridgeService() as never)

    await expect(service.updateStatus('food_1', { status: FoodStatus.consumed }, USER_ID)).resolves.toEqual(
      expect.objectContaining({ id: 'food_1', status: FoodStatus.consumed }),
    )
    expect(prisma.foodItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: FoodStatus.consumed } }))
  })

  it('updateStatus rejects when food belongs to another user', async () => {
    const prisma = {
      foodItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'food_1', fridgeId: 'fridge_x',
          fridge: { userId: 'user_other' },
        }),
      },
    }
    const service = new FoodService(prisma as never, makeFridgeService() as never)

    await expect(service.updateStatus('food_1', { status: FoodStatus.consumed }, USER_ID)).rejects.toMatchObject({
      response: '无权访问该食材',
      status: HttpStatus.FORBIDDEN,
    })
  })

  it('consumes quantity and marks food consumed when quantity reaches zero', async () => {
    const tx = {
      foodItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'food_1', name: '番茄', quantity: new Prisma.Decimal(1), status: FoodStatus.normal, unit: '个',
            fridge: { userId: USER_ID },
          },
        ]),
        update: jest.fn().mockResolvedValue({ id: 'food_1', status: FoodStatus.consumed, unit: '个' }),
      },
    }
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
    }
    const service = new FoodService(prisma as never, makeFridgeService() as never)

    await expect(service.consumeBatch({ recipeName: '番茄炒蛋', items: [{ foodId: 'food_1', quantity: 1 }] }, USER_ID)).resolves.toEqual({
      recipeName: '番茄炒蛋',
      items: [{
        foodId: 'food_1', name: '番茄', previousQuantity: 1, consumedQuantity: 1,
        remainingQuantity: 0, status: FoodStatus.consumed, unit: '个',
      }],
    })
  })

  it('consumeBatch rejects when any item belongs to another user', async () => {
    const tx = {
      foodItem: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'food_1', name: '番茄', quantity: new Prisma.Decimal(1), status: FoodStatus.normal, unit: '个', fridge: { userId: 'user_other' } },
        ]),
      },
    }
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
    }
    const service = new FoodService(prisma as never, makeFridgeService() as never)

    await expect(service.consumeBatch({ items: [{ foodId: 'food_1', quantity: 1 }] }, USER_ID)).rejects.toMatchObject({
      response: '无权操作该食材',
      status: HttpStatus.FORBIDDEN,
    })
  })

  it('rejects consuming more than current quantity', async () => {
    const tx = {
      foodItem: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'food_1', name: '番茄', quantity: new Prisma.Decimal(1), status: FoodStatus.normal, unit: '个', fridge: { userId: USER_ID } },
        ]),
      },
    }
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
    }
    const service = new FoodService(prisma as never, makeFridgeService() as never)

    await expect(service.consumeBatch({ items: [{ foodId: 'food_1', quantity: 2 }] }, USER_ID)).rejects.toMatchObject({
      response: '扣减数量不能超过当前库存',
      status: HttpStatus.BAD_REQUEST,
    })
  })

  it('rejects duplicate foodId in consume batch', async () => {
    const prisma = { $transaction: jest.fn() }
    const service = new FoodService(prisma as never, makeFridgeService() as never)

    await expect(
      service.consumeBatch({
        items: [
          { foodId: 'food_1', quantity: 1 },
          { foodId: 'food_1', quantity: 1 },
        ],
      }, USER_ID),
    ).rejects.toMatchObject({
      response: '扣减列表中存在重复的食材',
      status: HttpStatus.BAD_REQUEST,
    })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('uses a single findMany for batch consume to avoid N+1', async () => {
    const tx = {
      foodItem: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'food_1', name: '番茄', quantity: new Prisma.Decimal(2), status: FoodStatus.normal, unit: '个', fridge: { userId: USER_ID } },
          { id: 'food_2', name: '鸡蛋', quantity: new Prisma.Decimal(5), status: FoodStatus.normal, unit: '个', fridge: { userId: USER_ID } },
        ]),
        update: jest.fn()
          .mockResolvedValueOnce({ id: 'food_1', status: FoodStatus.normal, unit: '个' })
          .mockResolvedValueOnce({ id: 'food_2', status: FoodStatus.normal, unit: '个' }),
      },
    }
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
    }
    const service = new FoodService(prisma as never, makeFridgeService() as never)

    await service.consumeBatch({
      items: [
        { foodId: 'food_1', quantity: 1 },
        { foodId: 'food_2', quantity: 2 },
      ],
    }, USER_ID)

    expect(tx.foodItem.findMany).toHaveBeenCalledTimes(1)
    expect(tx.foodItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['food_1', 'food_2'] } },
    }))
    expect(tx.foodItem.update).toHaveBeenCalledTimes(2)
  })

  it('passes configurable expiring query to Prisma with user filter', async () => {
    let findManyArg: { where: { expireDate: { gte: Date, lte: Date }, fridgeId: string, status: FoodStatus, fridge: { userId: string } } } | undefined
    const fridgeService = makeFridgeService()
    const prisma = {
      foodItem: {
        findMany: jest.fn().mockImplementation((arg: typeof findManyArg) => {
          findManyArg = arg
          return Promise.resolve([])
        }),
        count: jest.fn().mockResolvedValue(0),
      },
    }
    const service = new FoodService(prisma as never, fridgeService as never)

    await service.listExpiring({ fridgeId: 'fridge_1', days: 3, includeExpired: false }, USER_ID)

    expect(fridgeService.ensureFridgeOwnedByUser).toHaveBeenCalledWith('fridge_1', USER_ID)
    expect(findManyArg?.where.fridgeId).toBe('fridge_1')
    expect(findManyArg?.where.fridge.userId).toBe(USER_ID)
    expect(findManyArg?.where.status).toBe(FoodStatus.normal)
    expect(findManyArg?.where.expireDate.gte).toBeInstanceOf(Date)
    expect(findManyArg?.where.expireDate.lte).toBeInstanceOf(Date)
  })
})
