import type { FoodItem } from '@prisma/client'

export type FoodExpiryLevel = 'expired' | 'today' | 'within3Days' | 'within7Days' | 'normal'

export interface FoodItemWithExpiryLevel extends FoodItem {
  expiryLevel: FoodExpiryLevel
  daysToExpire: number
}
