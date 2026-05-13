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
