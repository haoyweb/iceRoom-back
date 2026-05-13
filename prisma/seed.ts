/**
 * 推荐规则种子数据。
 *
 * 本脚本可以安全地重复运行（幂等）：
 * - 依赖 RecipeSuggestionRule.name 字段的 @unique 约束
 * - createMany + skipDuplicates 保证已存在的同名规则不会重复插入或报错
 *
 * 注意：若调整某个规则的 ingredients / popularityScore，需要先删除旧记录或改用 upsert，
 * skipDuplicates 不会更新现有行。
 */
import { PrismaClient, RecipeDifficulty } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.recipeSuggestionRule.createMany({
    data: [
      {
        name: '番茄炒蛋',
        requiredIngredients: ['番茄', '鸡蛋'],
        optionalIngredients: ['葱'],
        missingIngredients: [],
        difficulty: RecipeDifficulty.easy,
        estimatedMinutes: 15,
        reasonTemplate: '可以优先消耗临期的番茄和鸡蛋，做法简单，适合作为今日快手菜。',
        popularityScore: 100,
        source: 'seed',
      },
      {
        name: '香菇青菜',
        requiredIngredients: ['香菇', '青菜'],
        optionalIngredients: ['蒜'],
        missingIngredients: [],
        difficulty: RecipeDifficulty.easy,
        estimatedMinutes: 12,
        reasonTemplate: '能同时处理临期蔬菜，清淡且制作时间短。',
        popularityScore: 80,
        source: 'seed',
      },
      {
        name: '土豆炖牛肉',
        requiredIngredients: ['土豆', '牛肉'],
        optionalIngredients: ['胡萝卜', '洋葱'],
        missingIngredients: [],
        difficulty: RecipeDifficulty.medium,
        estimatedMinutes: 45,
        reasonTemplate: '适合一次消耗较多食材，适合正餐。',
        popularityScore: 70,
        source: 'seed',
      },
    ],
    skipDuplicates: true,
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error: unknown) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
