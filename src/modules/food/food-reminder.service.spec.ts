import { FoodReminderAction, NotificationStatus } from '@prisma/client'
import { FoodReminderService } from './food-reminder.service'

const USER_ID = 'user_1'
const FOOD_ID = 'food_1'
const NOW = new Date('2026-05-29T08:00:00.000Z')

const makeFoodService = () => ({
  ensureFoodExistsForUser: jest.fn().mockResolvedValue({ id: FOOD_ID }),
})

describe('FoodReminderService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('marks matching food expiring notification as read after ignore', async () => {
    const prisma = {
      foodReminder: {
        upsert: jest.fn().mockResolvedValue({ id: 'reminder_1', action: FoodReminderAction.ignore }),
      },
      notification: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const service = new FoodReminderService(prisma as never, makeFoodService() as never)

    await expect(service.ignore(FOOD_ID, USER_ID)).resolves.toEqual({ id: 'reminder_1', action: FoodReminderAction.ignore })
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        dedupeKey: `food_expiring:${FOOD_ID}`,
        status: NotificationStatus.unread,
      },
      data: { status: NotificationStatus.read, readAt: NOW },
    })
  })

  it('marks matching food expiring notification as read after snooze', async () => {
    const snoozedUntil = new Date('2026-05-30T08:00:00.000Z')
    const prisma = {
      foodReminder: {
        upsert: jest.fn().mockResolvedValue({ id: 'reminder_1', action: FoodReminderAction.snooze }),
      },
      notification: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const service = new FoodReminderService(prisma as never, makeFoodService() as never)

    await expect(service.snooze(FOOD_ID, USER_ID, 24)).resolves.toEqual({ id: 'reminder_1', action: FoodReminderAction.snooze })
    expect(prisma.foodReminder.upsert).toHaveBeenCalledWith({
      where: { userId_foodId: { userId: USER_ID, foodId: FOOD_ID } },
      create: { userId: USER_ID, foodId: FOOD_ID, action: FoodReminderAction.snooze, snoozedUntil },
      update: { action: FoodReminderAction.snooze, snoozedUntil },
    })
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        dedupeKey: `food_expiring:${FOOD_ID}`,
        status: NotificationStatus.unread,
      },
      data: { status: NotificationStatus.read, readAt: NOW },
    })
  })
})
