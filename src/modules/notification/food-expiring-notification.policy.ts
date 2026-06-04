import { NotificationStatus, NotificationType } from '@prisma/client'
import { getDaysToExpire, getExpiryLevel } from '@/common/utils/expiry'
import type { FoodExpiryLevel } from '@/common/utils/expiry'

export const FOOD_EXPIRING_REMINDER_WINDOW_DAYS = 7
export const FOOD_EXPIRING_GENERATED_REASON = 'food_expiring'

export type FoodExpiringNotificationSeverity = 'critical' | 'urgent' | 'warning' | 'notice'

export interface FoodExpiringNotificationFood {
  id: string
  name: string
  expireDate: Date
  fridgeId: string
  shelfId: string | null
}

export interface FoodExpiringNotificationMetadata {
  foodId: string
  foodName: string
  fridgeId: string
  shelfId: string | null
  expireDate: string
  daysToExpire: number
  expiryLevel: Exclude<FoodExpiryLevel, 'normal'>
  severity: FoodExpiringNotificationSeverity
  reminderWindowDays: number
  generatedReason: typeof FOOD_EXPIRING_GENERATED_REASON
}

export interface ExistingFoodExpiringNotification {
  status: NotificationStatus
  metadata: unknown
}

const EXPIRY_LEVEL_SEVERITY: Record<Exclude<FoodExpiryLevel, 'normal'>, FoodExpiringNotificationSeverity> = {
  expired: 'critical',
  today: 'urgent',
  within3Days: 'warning',
  within7Days: 'notice',
}

const SEVERITY_RANK: Record<FoodExpiringNotificationSeverity, number> = {
  notice: 1,
  warning: 2,
  urgent: 3,
  critical: 4,
}

export function foodExpiringDedupeKey(foodId: string) {
  return `${NotificationType.food_expiring}:${foodId}`
}

export function buildFoodExpiringNotificationPayload(food: FoodExpiringNotificationFood) {
  const daysToExpire = getDaysToExpire(food.expireDate)
  const expiryLevel = getExpiryLevel(daysToExpire)

  if (expiryLevel === 'normal') {
    return null
  }

  const severity = EXPIRY_LEVEL_SEVERITY[expiryLevel]
  const text = buildFoodExpiringText(food.name, daysToExpire, expiryLevel)

  return {
    ...text,
    metadata: {
      foodId: food.id,
      foodName: food.name,
      fridgeId: food.fridgeId,
      shelfId: food.shelfId,
      expireDate: food.expireDate.toISOString(),
      daysToExpire,
      expiryLevel,
      severity,
      reminderWindowDays: FOOD_EXPIRING_REMINDER_WINDOW_DAYS,
      generatedReason: FOOD_EXPIRING_GENERATED_REASON,
    } satisfies FoodExpiringNotificationMetadata,
  }
}

export function shouldReopenFoodExpiringNotification(
  existing: ExistingFoodExpiringNotification | undefined,
  nextSeverity: FoodExpiringNotificationSeverity,
) {
  if (!existing || existing.status !== NotificationStatus.read) {
    return false
  }

  const previousSeverity = getMetadataSeverity(existing.metadata)
  if (!previousSeverity) {
    return false
  }

  return SEVERITY_RANK[nextSeverity] > SEVERITY_RANK[previousSeverity]
}

function getMetadataSeverity(metadata: unknown): FoodExpiringNotificationSeverity | null {
  if (!metadata || typeof metadata !== 'object') {
    return null
  }

  const { daysToExpire, expiryLevel, severity } = metadata as { daysToExpire?: unknown, expiryLevel?: unknown, severity?: unknown }
  if (severity === 'critical' || severity === 'urgent' || severity === 'warning' || severity === 'notice') {
    return severity
  }

  if (expiryLevel === 'expired' || expiryLevel === 'today' || expiryLevel === 'within3Days' || expiryLevel === 'within7Days') {
    return EXPIRY_LEVEL_SEVERITY[expiryLevel]
  }

  if (typeof daysToExpire === 'number') {
    const legacyExpiryLevel = getExpiryLevel(daysToExpire)
    return legacyExpiryLevel === 'normal' ? null : EXPIRY_LEVEL_SEVERITY[legacyExpiryLevel]
  }

  return null
}

function buildFoodExpiringText(foodName: string, daysToExpire: number, expiryLevel: Exclude<FoodExpiryLevel, 'normal'>) {
  if (expiryLevel === 'expired') {
    return {
      title: `「${foodName}」已过期，建议尽快确认`,
      content: '这件食材已经超过保鲜期，可以确认是否还能使用，或及时标记为丢弃。',
    }
  }

  if (expiryLevel === 'today') {
    return {
      title: `「${foodName}」今天到期`,
      content: '这件食材今天到期，可以优先安排到今天的菜谱中。',
    }
  }

  if (expiryLevel === 'within3Days') {
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
