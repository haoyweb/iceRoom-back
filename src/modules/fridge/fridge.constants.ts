import { StorageArea } from '@prisma/client'

export const DEFAULT_STORAGE_SHELVES = [
  { area: StorageArea.door, name: '门架', sort: 1 },
  { area: StorageArea.fridge, name: '冷藏上层', sort: 1 },
  { area: StorageArea.fridge, name: '冷藏下层', sort: 2 },
  { area: StorageArea.drawer, name: '保鲜抽屉', sort: 1 },
  { area: StorageArea.freezer, name: '冷冻层', sort: 1 },
] as const
