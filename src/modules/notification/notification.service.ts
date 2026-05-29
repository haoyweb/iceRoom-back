import { HttpStatus, Injectable } from '@nestjs/common'
import { FoodStatus, NotificationStatus, NotificationTargetType, NotificationType, Prisma } from '@prisma/client'
import { createPageResult } from '@/common/dto/page.dto'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { getDaysToExpire } from '@/common/utils/expiry'
import { PrismaService } from '@/database/prisma.service'
import { FoodReminderService } from '../food/food-reminder.service'
import type { MarkAllNotificationsReadDto } from './dto/mark-all-notifications-read.dto'
import type { NotificationQueryDto } from './dto/notification-query.dto'

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
        dedupeKey: this.foodExpiringDedupeKey(foodId),
        status: NotificationStatus.unread,
      },
      data: { status: NotificationStatus.read, readAt: new Date() },
    })
  }

  private async syncFoodExpiringNotifications(userId: string) {
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    end.setDate(end.getDate() + 7)

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

    await Promise.all(
      foods.map((food) => {
        const daysToExpire = getDaysToExpire(food.expireDate)
        const payload = this.buildFoodExpiringPayload(food.name, daysToExpire)

        return this.prisma.notification.upsert({
          where: { userId_dedupeKey: { userId, dedupeKey: this.foodExpiringDedupeKey(food.id) } },
          create: {
            userId,
            type: NotificationType.food_expiring,
            title: payload.title,
            content: payload.content,
            targetType: NotificationTargetType.food,
            targetId: food.id,
            dedupeKey: this.foodExpiringDedupeKey(food.id),
            metadata: {
              foodId: food.id,
              foodName: food.name,
              fridgeId: food.fridgeId,
              shelfId: food.shelfId,
              expireDate: food.expireDate.toISOString(),
              daysToExpire,
            },
          },
          update: {
            title: payload.title,
            content: payload.content,
            targetType: NotificationTargetType.food,
            targetId: food.id,
            metadata: {
              foodId: food.id,
              foodName: food.name,
              fridgeId: food.fridgeId,
              shelfId: food.shelfId,
              expireDate: food.expireDate.toISOString(),
              daysToExpire,
            },
          },
        })
      }),
    )
  }

  private foodExpiringDedupeKey(foodId: string) {
    return `${NotificationType.food_expiring}:${foodId}`
  }

  private buildFoodExpiringPayload(foodName: string, daysToExpire: number) {
    if (daysToExpire < 0) {
      return {
        title: `「${foodName}」已过期，建议尽快确认`,
        content: '这件食材已经超过保鲜期，可以确认是否还能使用，或及时标记为丢弃。',
      }
    }

    if (daysToExpire === 0) {
      return {
        title: `「${foodName}」今天到期`,
        content: '这件食材今天到期，可以优先安排到今天的菜谱中。',
      }
    }

    if (daysToExpire <= 3) {
      return {
        title: `「${foodName}」将在 3 天内到期`,
        content: `这件食材还有 ${daysToExpire} 天到期，可以优先安排到最近的菜谱中。`,
      }
    }

    return {
      title: `「${foodName}」即将到期`,
      content: `这件食材还有 ${daysToExpire} 天到期，记得提前安排使用。`,
    }
  }
}
