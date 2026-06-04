import { HttpStatus } from '@nestjs/common'
import { FoodReminderAction, FoodStatus, NotificationStatus, NotificationTargetType, NotificationType } from '@prisma/client'
import { NotificationService } from './notification.service'

const USER_ID = 'user_1'
const NOW = new Date('2026-05-29T08:00:00.000Z')

type FoodOverrides = Partial<{ id: string, name: string, expireDate: Date, fridgeId: string, shelfId: string | null }>

function createFood(overrides: FoodOverrides = {}) {
  return {
    id: overrides.id ?? 'food_1',
    name: overrides.name ?? '牛奶',
    expireDate: overrides.expireDate ?? new Date('2026-05-30T00:00:00.000Z'),
    fridgeId: overrides.fridgeId ?? 'fridge_1',
    shelfId: overrides.shelfId ?? 'shelf_1',
  }
}

function expectedExpiringFoodQuery() {
  const end = new Date(NOW)
  end.setHours(23, 59, 59, 999)
  end.setDate(end.getDate() + 7)

  return {
    where: {
      fridge: { userId: USER_ID },
      status: FoodStatus.normal,
      expireDate: { lte: end },
      NOT: {
        reminders: {
          some: {
            userId: USER_ID,
            OR: [
              { action: FoodReminderAction.ignore },
              { action: FoodReminderAction.snooze, snoozedUntil: { gt: NOW } },
            ],
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      expireDate: true,
      fridgeId: true,
      shelfId: true,
    },
    orderBy: [{ expireDate: 'asc' }, { createdAt: 'asc' }],
  }
}

function expectedMetadata(food = createFood(), overrides: Partial<Record<string, unknown>> = {}) {
  return {
    foodId: food.id,
    foodName: food.name,
    fridgeId: food.fridgeId,
    shelfId: food.shelfId,
    expireDate: food.expireDate.toISOString(),
    daysToExpire: 1,
    expiryLevel: 'within3Days',
    severity: 'warning',
    reminderWindowDays: 7,
    generatedReason: 'food_expiring',
    ...overrides,
  }
}

function expectedFoodNotificationUpsert(food = createFood(), updateOverrides: Record<string, unknown> = {}) {
  const metadata = expectedMetadata(food)

  return {
    where: { userId_dedupeKey: { userId: USER_ID, dedupeKey: `food_expiring:${food.id}` } },
    create: {
      userId: USER_ID,
      type: NotificationType.food_expiring,
      title: `「${food.name}」将在 3 天内到期`,
      content: '这件食材还有 1 天到期，可以优先安排到最近的菜谱中。',
      targetType: NotificationTargetType.food,
      targetId: food.id,
      dedupeKey: `food_expiring:${food.id}`,
      metadata,
    },
    update: {
      title: `「${food.name}」将在 3 天内到期`,
      content: '这件食材还有 1 天到期，可以优先安排到最近的菜谱中。',
      targetType: NotificationTargetType.food,
      targetId: food.id,
      metadata,
      ...updateOverrides,
    },
  }
}

function createPrismaForSync(
  foods = [createFood()],
  existingNotifications: Array<Record<string, unknown>> = [],
  unreadCount = foods.length,
) {
  return {
    foodItem: { findMany: jest.fn().mockResolvedValue(foods) },
    notification: {
      findMany: jest.fn().mockResolvedValue(existingNotifications),
      upsert: jest.fn().mockResolvedValue({ id: 'notification_1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(unreadCount),
    },
  }
}

describe('NotificationService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('syncs expiring foods before listing notifications', async () => {
    const food = createFood()
    const list = [{ id: 'notification_1', status: NotificationStatus.unread }]
    const prisma = createPrismaForSync([food])
    prisma.notification.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(list)

    const service = new NotificationService(prisma as never)

    await expect(service.list({ page: 1, pageSize: 20 }, USER_ID)).resolves.toEqual({
      list,
      total: 1,
      page: 1,
      pageSize: 20,
    })

    expect(prisma.foodItem.findMany).toHaveBeenCalledWith(expectedExpiringFoodQuery())
    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, dedupeKey: { in: [`food_expiring:${food.id}`] } },
      select: { dedupeKey: true, status: true, metadata: true },
    })
    expect(prisma.notification.upsert).toHaveBeenCalledWith(expectedFoodNotificationUpsert(food))
  })

  it('does not create duplicate unread counts for the same food', async () => {
    const food = createFood()
    const prisma = createPrismaForSync([food])
    const service = new NotificationService(prisma as never)

    await expect(service.getUnreadCount(USER_ID)).resolves.toEqual({ count: 1 })

    expect(prisma.notification.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.notification.upsert).toHaveBeenCalledWith(expectedFoodNotificationUpsert(food))
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: USER_ID, status: NotificationStatus.unread },
    })
  })

  it('reopens a read notification when food severity upgrades', async () => {
    const food = createFood()
    const prisma = createPrismaForSync([food], [
      {
        dedupeKey: `food_expiring:${food.id}`,
        status: NotificationStatus.read,
        metadata: { severity: 'notice' },
      },
    ])
    const service = new NotificationService(prisma as never)

    await service.getUnreadCount(USER_ID)

    expect(prisma.notification.upsert).toHaveBeenCalledWith(expectedFoodNotificationUpsert(food, {
      status: NotificationStatus.unread,
      readAt: null,
    }))
  })

  it('reopens read notifications created before severity metadata existed', async () => {
    const food = createFood()
    const prisma = createPrismaForSync([food], [
      {
        dedupeKey: `food_expiring:${food.id}`,
        status: NotificationStatus.read,
        metadata: { daysToExpire: 6 },
      },
    ])
    const service = new NotificationService(prisma as never)

    await service.getUnreadCount(USER_ID)

    expect(prisma.notification.upsert).toHaveBeenCalledWith(expectedFoodNotificationUpsert(food, {
      status: NotificationStatus.unread,
      readAt: null,
    }))
  })

  it('keeps a read notification read when severity does not upgrade', async () => {
    const food = createFood()
    const prisma = createPrismaForSync([food], [
      {
        dedupeKey: `food_expiring:${food.id}`,
        status: NotificationStatus.read,
        metadata: { severity: 'warning' },
      },
    ])
    const service = new NotificationService(prisma as never)

    await service.getUnreadCount(USER_ID)

    expect(prisma.notification.upsert).toHaveBeenCalledWith(expectedFoodNotificationUpsert(food))
  })

  it('does not reopen unread notifications during severity upgrades', async () => {
    const food = createFood()
    const prisma = createPrismaForSync([food], [
      {
        dedupeKey: `food_expiring:${food.id}`,
        status: NotificationStatus.unread,
        metadata: { severity: 'notice' },
      },
    ])
    const service = new NotificationService(prisma as never)

    await service.getUnreadCount(USER_ID)

    expect(prisma.notification.upsert).toHaveBeenCalledWith(expectedFoodNotificationUpsert(food))
  })

  it('builds today and expired metadata for higher severity foods', async () => {
    const todayFood = createFood({ id: 'food_today', expireDate: new Date('2026-05-29T00:00:00.000Z') })
    const expiredFood = createFood({ id: 'food_expired', expireDate: new Date('2026-05-28T00:00:00.000Z') })
    const prisma = createPrismaForSync([todayFood, expiredFood])
    const service = new NotificationService(prisma as never)

    await service.getUnreadCount(USER_ID)

    expect(prisma.notification.upsert).toHaveBeenCalledWith({
      where: { userId_dedupeKey: { userId: USER_ID, dedupeKey: `food_expiring:${todayFood.id}` } },
      create: {
        userId: USER_ID,
        type: NotificationType.food_expiring,
        title: '「牛奶」今天到期',
        content: '这件食材今天到期，可以优先安排到今天的菜谱中。',
        targetType: NotificationTargetType.food,
        targetId: todayFood.id,
        dedupeKey: `food_expiring:${todayFood.id}`,
        metadata: expectedMetadata(todayFood, { daysToExpire: 0, expiryLevel: 'today', severity: 'urgent' }),
      },
      update: {
        title: '「牛奶」今天到期',
        content: '这件食材今天到期，可以优先安排到今天的菜谱中。',
        targetType: NotificationTargetType.food,
        targetId: todayFood.id,
        metadata: expectedMetadata(todayFood, { daysToExpire: 0, expiryLevel: 'today', severity: 'urgent' }),
      },
    })
    expect(prisma.notification.upsert).toHaveBeenCalledWith({
      where: { userId_dedupeKey: { userId: USER_ID, dedupeKey: `food_expiring:${expiredFood.id}` } },
      create: {
        userId: USER_ID,
        type: NotificationType.food_expiring,
        title: '「牛奶」已过期，建议尽快确认',
        content: '这件食材已经超过保鲜期，可以确认是否还能使用，或及时标记为丢弃。',
        targetType: NotificationTargetType.food,
        targetId: expiredFood.id,
        dedupeKey: `food_expiring:${expiredFood.id}`,
        metadata: expectedMetadata(expiredFood, { daysToExpire: -1, expiryLevel: 'expired', severity: 'critical' }),
      },
      update: {
        title: '「牛奶」已过期，建议尽快确认',
        content: '这件食材已经超过保鲜期，可以确认是否还能使用，或及时标记为丢弃。',
        targetType: NotificationTargetType.food,
        targetId: expiredFood.id,
        metadata: expectedMetadata(expiredFood, { daysToExpire: -1, expiryLevel: 'expired', severity: 'critical' }),
      },
    })
  })

  it('marks stale unread food expiring notifications as read while syncing current foods', async () => {
    const food = createFood({ id: 'food_active' })
    const prisma = createPrismaForSync([food])
    const service = new NotificationService(prisma as never)

    await expect(service.getUnreadCount(USER_ID)).resolves.toEqual({ count: 1 })

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        type: NotificationType.food_expiring,
        status: NotificationStatus.unread,
        targetType: NotificationTargetType.food,
        OR: [
          { targetId: { notIn: ['food_active'] } },
          { targetId: null },
        ],
      },
      data: { status: NotificationStatus.read, readAt: NOW },
    })
  })

  it('marks all unread food expiring notifications as read when no foods are currently expiring', async () => {
    const prisma = createPrismaForSync([])
    const service = new NotificationService(prisma as never)

    await expect(service.getUnreadCount(USER_ID)).resolves.toEqual({ count: 0 })

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        type: NotificationType.food_expiring,
        status: NotificationStatus.unread,
        targetType: NotificationTargetType.food,
      },
      data: { status: NotificationStatus.read, readAt: NOW },
    })
    expect(prisma.notification.findMany).not.toHaveBeenCalled()
    expect(prisma.notification.upsert).not.toHaveBeenCalled()
  })

  it('marks unread notification as read idempotently', async () => {
    const notification = { id: 'notification_1', userId: USER_ID, status: NotificationStatus.unread }
    const updated = { ...notification, status: NotificationStatus.read, readAt: NOW }
    const prisma = {
      notification: {
        findFirst: jest.fn().mockResolvedValue(notification),
        update: jest.fn().mockResolvedValue(updated),
      },
    }
    const service = new NotificationService(prisma as never)

    await expect(service.markRead('notification_1', USER_ID)).resolves.toBe(updated)
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notification_1' },
      data: { status: NotificationStatus.read, readAt: NOW },
    })
  })

  it('returns read notification without updating it again', async () => {
    const notification = { id: 'notification_1', userId: USER_ID, status: NotificationStatus.read }
    const prisma = {
      notification: {
        findFirst: jest.fn().mockResolvedValue(notification),
        update: jest.fn(),
      },
    }
    const service = new NotificationService(prisma as never)

    await expect(service.markRead('notification_1', USER_ID)).resolves.toBe(notification)
    expect(prisma.notification.update).not.toHaveBeenCalled()
  })

  it('rejects reading notifications from another user', async () => {
    const prisma = {
      notification: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    }
    const service = new NotificationService(prisma as never)

    await expect(service.markRead('notification_1', USER_ID)).rejects.toMatchObject({
      response: '通知不存在',
      status: HttpStatus.NOT_FOUND,
    })
  })

  it('syncs current expiring notifications before marking all as read', async () => {
    const food = createFood()
    const prisma = createPrismaForSync([food])
    prisma.notification.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 3 })
    const service = new NotificationService(prisma as never)

    await expect(service.markAllRead({}, USER_ID)).resolves.toEqual({ updatedCount: 3 })
    expect(prisma.notification.upsert).toHaveBeenCalledWith(expectedFoodNotificationUpsert(food))
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, status: NotificationStatus.unread },
      data: { status: NotificationStatus.read, readAt: NOW },
    })
  })
})
