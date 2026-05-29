import { Injectable } from '@nestjs/common'
import { FoodReminderAction, NotificationStatus, NotificationType, Prisma } from '@prisma/client'
import { PrismaService } from '@/database/prisma.service'
import { FoodService } from './food.service'

/**
 * 食材提醒偏好（忽略 / 延后）的服务。
 *
 * 设计要点：
 *  - 每个 (userId, foodId) 只保留一条记录，重复操作走 upsert，避免历史堆积。
 *  - 校验先行：ignore/snooze/restore 均先调 FoodService.ensureFoodExistsForUser
 *    保证 food 存在且属于当前用户，再执行写操作。
 *  - 不在表上存「是否生效」状态，由查询端实时推导：
 *      action=ignore OR (action=snooze AND snoozedUntil > now)
 *    避免后台定时任务清扫过期 snooze。
 *
 * 给 FoodService.listExpiring / RecipeSuggestionService.getFoodMapByFridge 复用的
 * Prisma where 片段是 buildActiveReminderFilter()，集中维护「生效中提醒」的判定。
 */
@Injectable()
export class FoodReminderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly foodService: FoodService,
  ) {}

  async ignore(foodId: string, userId: string) {
    await this.foodService.ensureFoodExistsForUser(foodId, userId)

    const reminder = await this.prisma.foodReminder.upsert({
      where: { userId_foodId: { userId, foodId } },
      create: { userId, foodId, action: FoodReminderAction.ignore, snoozedUntil: null },
      update: { action: FoodReminderAction.ignore, snoozedUntil: null },
    })

    await this.markFoodExpiringNotificationRead(userId, foodId)

    return reminder
  }

  async snooze(foodId: string, userId: string, snoozeHours: number) {
    await this.foodService.ensureFoodExistsForUser(foodId, userId)

    const snoozedUntil = new Date(Date.now() + snoozeHours * 60 * 60 * 1000)

    const reminder = await this.prisma.foodReminder.upsert({
      where: { userId_foodId: { userId, foodId } },
      create: { userId, foodId, action: FoodReminderAction.snooze, snoozedUntil },
      update: { action: FoodReminderAction.snooze, snoozedUntil },
    })

    await this.markFoodExpiringNotificationRead(userId, foodId)

    return reminder
  }

  async restore(foodId: string, userId: string) {
    await this.foodService.ensureFoodExistsForUser(foodId, userId)

    // 幂等：deleteMany 在没有匹配行时也是成功，不抛 NotFound。
    // 业务语义是「让食材回到正常提醒队列」，没记录就等价于已经在队列里，对调用方零差异。
    await this.prisma.foodReminder.deleteMany({
      where: { userId, foodId },
    })

    return { success: true }
  }

  /**
   * 构造「生效中提醒」的 Prisma where 片段，给 FoodItem 反向关系查询用。
   *
   * 用法：
   *   const where = {
   *     fridge: { userId },
   *     NOT: { reminders: { some: FoodReminderService.buildActiveReminderFilter(userId) } },
   *   }
   *
   * 静态方法 + 接 userId 参数，是为了让调用方在自己的 service 里就能拼 where，
   * 不需要循环依赖 FoodReminderService 实例。
   */
  static buildActiveReminderFilter(userId: string, now: Date = new Date()): Prisma.FoodReminderWhereInput {
    return {
      userId,
      OR: [
        { action: FoodReminderAction.ignore },
        { action: FoodReminderAction.snooze, snoozedUntil: { gt: now } },
      ],
    }
  }

  private async markFoodExpiringNotificationRead(userId: string, foodId: string) {
    await this.prisma.notification.updateMany({
      where: {
        userId,
        dedupeKey: `${NotificationType.food_expiring}:${foodId}`,
        status: NotificationStatus.unread,
      },
      data: { status: NotificationStatus.read, readAt: new Date() },
    })
  }
}
