import type { FoodItem } from '@prisma/client'
import type { FoodExpiryLevel } from '@/common/utils/expiry'

export type { FoodExpiryLevel } from '@/common/utils/expiry'

export interface FoodItemWithExpiryLevel extends FoodItem {
  expiryLevel: FoodExpiryLevel
  daysToExpire: number
}
