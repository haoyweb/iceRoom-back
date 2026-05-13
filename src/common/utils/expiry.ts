export type FoodExpiryLevel = 'expired' | 'today' | 'within3Days' | 'within7Days' | 'normal'

const MS_PER_DAY = 86_400_000

function startOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

export function getDaysToExpire(expireDate: Date, now: Date = new Date()): number {
  return Math.ceil((startOfDay(expireDate).getTime() - startOfDay(now).getTime()) / MS_PER_DAY)
}

export function getExpiryLevel(daysToExpire: number): FoodExpiryLevel {
  if (daysToExpire < 0) {
    return 'expired'
  }
  if (daysToExpire === 0) {
    return 'today'
  }
  if (daysToExpire <= 3) {
    return 'within3Days'
  }
  if (daysToExpire <= 7) {
    return 'within7Days'
  }
  return 'normal'
}

export function getExpiryScore(daysToExpire: number): number {
  if (daysToExpire < 0) {
    return 100
  }
  if (daysToExpire === 0) {
    return 80
  }
  if (daysToExpire <= 3) {
    return 50
  }
  if (daysToExpire <= 7) {
    return 20
  }
  return 1
}

export function withExpiryInfo<T extends { expireDate: Date }>(item: T, now?: Date): T & { daysToExpire: number, expiryLevel: FoodExpiryLevel } {
  const daysToExpire = getDaysToExpire(item.expireDate, now)
  return {
    ...item,
    daysToExpire,
    expiryLevel: getExpiryLevel(daysToExpire),
  }
}
