import { HttpStatus } from '@nestjs/common'
import { FoodReminderAction, FoodStatus, NotificationStatus, NotificationTargetType, NotificationType } from '@prisma/client'
import { NotificationService } from './notification.service'

const USER_ID = 'user_1'
const NOW = new Date('2026-05-29T08:00:00.000Z')

function createFood(overrides: Partial<{ id: string, name: string, expireDate: Date, fridgeId: string, shelfId: string }> = {}) {
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

function expectedFoodNotificationUpsert(food = createFood()) {
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
      metadata: {
        foodId: food.id,
        foodName: food.name,
        fridgeId: food.fridgeId,
        shelfId: food.shelfId,
        expireDate: food.expireDate.toISOString(),
        daysToExpire: 1,
      },
    },
    update: {
      title: `「${food.name}」将在 3 天内到期`,
      content: '这件食材还有 1 天到期，可以优先安排到最近的菜谱中。',
      targetType: NotificationTargetType.food,
      targetId: food.id,
      metadata: {
        foodId: food.id,
        foodName: food.name,
        fridgeId: food.fridgeId,
        shelfId: food.shelfId,
        expireDate: food.expireDate.toISOString(),
        daysToExpire: 1,
      },
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
    const findMany = jest.fn()
      .mockResolvedValueOnce([food])
      .mockResolvedValueOnce([{ id: 'notification_1', status: NotificationStatus.unread }])
    const prisma = {
      foodItem: { findMany },
      notification: {
        upsert: jest.fn().mockResolvedValue({ id: 'notification_1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany,
        count: jest.fn().mockResolvedValue(1),
      },
    }
    const service = new NotificationService(prisma as never)

    await expect(service.list({ page: 1, pageSize: 20 }, USER_ID)).resolves.toEqual({
      list: [{ id: 'notification_1', status: NotificationStatus.unread }],
      total: 1,
      page: 1,
      pageSize: 20,
    })

    expect(prisma.foodItem.findMany).toHaveBeenCalledWith(expectedExpiringFoodQuery())
    expect(prisma.notification.upsert).toHaveBeenCalledWith(expectedFoodNotificationUpsert(food))
  })

  it('does not create duplicate unread counts for the same food', async () => {
    const food = createFood()
    const prisma = {
      foodItem: { findMany: jest.fn().mockResolvedValue([food]) },
      notification: {
        upsert: jest.fn().mockResolvedValue({ id: 'notification_1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(1),
      },
    }
    const service = new NotificationService(prisma as never)

    await expect(service.getUnreadCount(USER_ID)).resolves.toEqual({ count: 1 })

    expect(prisma.notification.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.notification.upsert).toHaveBeenCalledWith(expectedFoodNotificationUpsert(food))
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: USER_ID, status: NotificationStatus.unread },
    })
  })

  it('marks stale unread food expiring notifications as read while syncing current foods', async () => {
    const food = createFood({ id: 'food_active' })
    const prisma = {
      foodItem: { findMany: jest.fn().mockResolvedValue([food]) },
      notification: {
        upsert: jest.fn().mockResolvedValue({ id: 'notification_1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        count: jest.fn().mockResolvedValue(1),
      },
    }
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
    const prisma = {
      foodItem: { findMany: jest.fn().mockResolvedValue([]) },
      notification: {
        upsert: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        count: jest.fn().mockResolvedValue(0),
      },
    }
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
    const prisma = {
      foodItem: { findMany: jest.fn().mockResolvedValue([food]) },
      notification: {
        upsert: jest.fn().mockResolvedValue({ id: 'notification_1' }),
        updateMany: jest.fn()
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 3 }),
      },
    }
    const service = new NotificationService(prisma as never)

    await expect(service.markAllRead({}, USER_ID)).resolves.toEqual({ updatedCount: 3 })
    expect(prisma.notification.upsert).toHaveBeenCalledWith(expectedFoodNotificationUpsert(food))
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, status: NotificationStatus.unread },
      data: { status: NotificationStatus.read, readAt: NOW },
    })
  })
})
