import { HttpStatus, Injectable } from '@nestjs/common'
import { FoodStatus, NotificationStatus, NotificationTargetType, NotificationType, Prisma } from '@prisma/client'
import { createPageResult } from '@/common/dto/page.dto'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { PrismaService } from '@/database/prisma.service'
import { FoodReminderService } from '../food/food-reminder.service'
import type { MarkAllNotificationsReadDto } from './dto/mark-all-notifications-read.dto'
import type { NotificationQueryDto } from './dto/notification-query.dto'
import {
  buildFoodExpiringNotificationPayload,
  FOOD_EXPIRING_REMINDER_WINDOW_DAYS,
  foodExpiringDedupeKey,
  shouldReopenFoodExpiringNotification,
} from './food-expiring-notification.policy'

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: NotificationQueryDto, userId: string) {
    await this.syncFoodExpiringNotifications(userId)

    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    }

    const [list, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
    ])

    return createPageResult(list, total, page, pageSize)
  }

  async getUnreadCount(userId: string) {
    await this.syncFoodExpiringNotifications(userId)

    const count = await this.prisma.notification.count({
      where: { userId, status: NotificationStatus.unread },
    })

    return { count }
  }

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    })

    if (!notification) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '通知不存在', HttpStatus.NOT_FOUND)
    }

    if (notification.status === NotificationStatus.read) {
      return notification
    }

    return this.prisma.notification.update({
      where: { id },
      data: { status: NotificationStatus.read, readAt: new Date() },
    })
  }

  async markAllRead(query: MarkAllNotificationsReadDto, userId: string) {
    await this.syncFoodExpiringNotifications(userId)

    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        status: NotificationStatus.unread,
        ...(query.type ? { type: query.type } : {}),
      },
      data: { status: NotificationStatus.read, readAt: new Date() },
    })

    return { updatedCount: result.count }
  }

  async markFoodExpiringNotificationRead(userId: string, foodId: string) {
    await this.prisma.notification.updateMany({
      where: {
        userId,
        dedupeKey: foodExpiringDedupeKey(foodId),
        status: NotificationStatus.unread,
      },
      data: { status: NotificationStatus.read, readAt: new Date() },
    })
  }

  private async syncFoodExpiringNotifications(userId: string) {
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    end.setDate(end.getDate() + FOOD_EXPIRING_REMINDER_WINDOW_DAYS)

    const foods = await this.prisma.foodItem.findMany({
      where: {
        fridge: { userId },
        status: FoodStatus.normal,
        expireDate: { lte: end },
        NOT: {
          reminders: {
            some: FoodReminderService.buildActiveReminderFilter(userId),
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
    })

    const activeFoodIds = foods.map(food => food.id)
    const staleWhere: Prisma.NotificationWhereInput = {
      userId,
      type: NotificationType.food_expiring,
      status: NotificationStatus.unread,
      targetType: NotificationTargetType.food,
      ...(activeFoodIds.length > 0
        ? {
            OR: [
              { targetId: { notIn: activeFoodIds } },
              { targetId: null },
            ],
          }
        : {}),
    }

    await this.prisma.notification.updateMany({
      where: staleWhere,
      data: { status: NotificationStatus.read, readAt: new Date() },
    })

    const existingNotifications = activeFoodIds.length > 0
      ? await this.prisma.notification.findMany({
          where: {
            userId,
            dedupeKey: { in: activeFoodIds.map(foodExpiringDedupeKey) },
          },
          select: {
            dedupeKey: true,
            status: true,
            metadata: true,
          },
        })
      : []
    const existingByDedupeKey = new Map(existingNotifications.map(notification => [notification.dedupeKey, notification]))

    const upserts = foods.flatMap((food) => {
      const dedupeKey = foodExpiringDedupeKey(food.id)
      const payload = buildFoodExpiringNotificationPayload(food)

      if (!payload) {
        return []
      }

      const shouldReopen = shouldReopenFoodExpiringNotification(existingByDedupeKey.get(dedupeKey), payload.metadata.severity)
      const update: Prisma.NotificationUpdateInput = {
        title: payload.title,
        content: payload.content,
        targetType: NotificationTargetType.food,
        targetId: food.id,
        metadata: payload.metadata,
        ...(shouldReopen ? { status: NotificationStatus.unread, readAt: null } : {}),
      }

      return this.prisma.notification.upsert({
        where: { userId_dedupeKey: { userId, dedupeKey } },
        create: {
          userId,
          type: NotificationType.food_expiring,
          title: payload.title,
          content: payload.content,
          targetType: NotificationTargetType.food,
          targetId: food.id,
          dedupeKey,
          metadata: payload.metadata,
        },
        update,
      })
    })

    await Promise.all(upserts)
  }
}
