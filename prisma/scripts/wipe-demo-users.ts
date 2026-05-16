/**
 * 一次性数据清理脚本：删除所有 User 行（cascade 删除其 Fridge/StorageShelf/FoodItem），
 * 保留 RecipeSuggestionRule（菜谱表不属于用户，是全局共享数据）。
 *
 * 用途：在 `add_user_auth_fields` 这次 migration 之前跑——给 User 表加 NOT NULL 的
 * `username` / `passwordHash` 列时，已有的 demo user 行没有值会导致 migrate 失败。
 * 清空 + migrate 是 MVP 阶段最干净的路线（用户已确认）。
 *
 * 生产环境演进时要走 data migration（先加可空列 → 回填数据 → 改 NOT NULL），
 * 但 MVP 没有线上数据需要保留。
 */
import { PrismaClient } from '@prisma/client'

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to wipe users in production.')
  }
  if (process.env.CONFIRM_WIPE_USERS !== 'YES_I_UNDERSTAND') {
    throw new Error('Set CONFIRM_WIPE_USERS=YES_I_UNDERSTAND to confirm destructive user wipe.')
  }

  const prisma = new PrismaClient()
  try {
    const userCount = await prisma.user.count()
    const fridgeCount = await prisma.fridge.count()
    const foodCount = await prisma.foodItem.count()
    console.log(`[wipe-demo-users] 即将清理: User=${userCount}, Fridge=${fridgeCount}, FoodItem=${foodCount}`)

    // Cascade 由 Prisma schema 控制：Fridge.user / Shelf.fridge / FoodItem.fridge 都 onDelete: Cascade
    // 所以只要 deleteMany user，下游全自动跟着清。
    const result = await prisma.user.deleteMany({})
    console.log(`[wipe-demo-users] 完成: 删除 ${result.count} 个用户（及其级联数据）`)

    const recipeCount = await prisma.recipeSuggestionRule.count()
    console.log(`[wipe-demo-users] 菜谱表保留: ${recipeCount} 条记录未受影响`)
  }
  finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('[wipe-demo-users] 失败:', err)
  process.exit(1)
})
