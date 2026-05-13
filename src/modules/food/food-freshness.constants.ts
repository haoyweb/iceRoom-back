import { FoodCategory, StorageArea } from '@prisma/client'

const NAME_FRESHNESS_DAYS: Record<string, number> = {
  番茄: 5,
  鸡蛋: 30,
  青菜: 3,
  香菇: 5,
  土豆: 14,
  牛肉: 3,
  鸡胸肉: 3,
  西兰花: 4,
  豆腐: 2,
  胡萝卜: 10,
}

const CATEGORY_AREA_FRESHNESS_DAYS: Partial<Record<FoodCategory, Partial<Record<StorageArea, number>>>> = {
  [FoodCategory.vegetable]: {
    [StorageArea.fridge]: 5,
    [StorageArea.drawer]: 5,
    [StorageArea.door]: 4,
    [StorageArea.freezer]: 30,
  },
  [FoodCategory.fruit]: {
    [StorageArea.fridge]: 7,
    [StorageArea.drawer]: 7,
    [StorageArea.door]: 5,
    [StorageArea.freezer]: 30,
  },
  [FoodCategory.meat]: {
    [StorageArea.fridge]: 3,
    [StorageArea.drawer]: 3,
    [StorageArea.freezer]: 60,
  },
  [FoodCategory.egg_milk]: {
    [StorageArea.fridge]: 14,
    [StorageArea.door]: 10,
    [StorageArea.freezer]: 30,
  },
  [FoodCategory.staple]: {
    [StorageArea.fridge]: 7,
    [StorageArea.freezer]: 30,
  },
  [FoodCategory.seasoning]: {
    [StorageArea.fridge]: 30,
    [StorageArea.door]: 30,
  },
}

const AREA_FRESHNESS_DAYS: Record<StorageArea, number> = {
  [StorageArea.fridge]: 7,
  [StorageArea.freezer]: 30,
  [StorageArea.door]: 10,
  [StorageArea.drawer]: 5,
}

export function getFreshnessDays(name: string, category: FoodCategory, storageArea: StorageArea) {
  return NAME_FRESHNESS_DAYS[name.trim()] ?? CATEGORY_AREA_FRESHNESS_DAYS[category]?.[storageArea] ?? AREA_FRESHNESS_DAYS[storageArea]
}

export function calculateExpireDate(baseDate: Date, freshnessDays: number) {
  const expireDate = new Date(baseDate)
  expireDate.setDate(expireDate.getDate() + freshnessDays)
  expireDate.setHours(23, 59, 59, 999)
  return expireDate
}
