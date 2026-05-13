import { HttpStatus } from '@nestjs/common'
import { RecipeDifficulty } from '@prisma/client'
import { RecipeSuggestionService } from './recipe-suggestion.service'

describe('RecipeSuggestionService', () => {
  it('suggests recipes by matched ingredients', async () => {
    const prisma = {
      recipeSuggestionRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rule_1',
            name: '番茄炒蛋',
            requiredIngredients: ['番茄', '鸡蛋'],
            difficulty: RecipeDifficulty.easy,
            estimatedMinutes: 15,
            reasonTemplate: '快手菜',
            popularityScore: 100,
          },
        ]),
      },
    }
    const service = new RecipeSuggestionService(prisma as never)

    await expect(service.suggest(['番茄'])).resolves.toEqual([
      expect.objectContaining({
        name: '番茄炒蛋',
        matchedIngredients: ['番茄'],
        missingIngredients: ['鸡蛋'],
      }),
    ])
  })

  it('rejects by-fridge suggestion when fridge does not exist', async () => {
    const prisma = {
      fridge: { findUnique: jest.fn().mockResolvedValue(null) },
    }
    const service = new RecipeSuggestionService(prisma as never)

    await expect(service.suggestByFridge('missing')).rejects.toMatchObject({
      response: '冰箱不存在',
      status: HttpStatus.NOT_FOUND,
    })
  })

  it('returns matched foods and expiring ids for by-fridge suggestion', async () => {
    const soon = new Date()
    soon.setDate(soon.getDate() + 1)
    const later = new Date()
    later.setDate(later.getDate() + 20)
    const prisma = {
      fridge: { findUnique: jest.fn().mockResolvedValue({ id: 'fridge_1' }) },
      foodItem: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'food_tomato', name: '番茄', expireDate: soon },
          { id: 'food_egg', name: '鸡蛋', expireDate: later },
        ]),
      },
      recipeSuggestionRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rule_1',
            name: '番茄炒蛋',
            requiredIngredients: ['番茄', '鸡蛋'],
            difficulty: RecipeDifficulty.easy,
            estimatedMinutes: 15,
            reasonTemplate: '快手菜',
            popularityScore: 100,
          },
        ]),
      },
    }
    const service = new RecipeSuggestionService(prisma as never)

    const result = await service.suggestByFridge('fridge_1')

    expect(result[0]?.name).toBe('番茄炒蛋')
    expect(result[0]?.matchedIngredients).toEqual(['番茄', '鸡蛋'])
    expect(result[0]?.missingIngredients).toEqual([])
    expect(result[0]?.usedExpiringFoodIds).toEqual(['food_tomato'])
    expect(result[0]?.matchedFoods).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'food_tomato', expiryLevel: 'within3Days' })]))
  })

  it('sorts by expiring score before popularity', async () => {
    const soon = new Date()
    soon.setDate(soon.getDate() + 1)
    const later = new Date()
    later.setDate(later.getDate() + 20)
    const prisma = {
      fridge: { findUnique: jest.fn().mockResolvedValue({ id: 'fridge_1' }) },
      foodItem: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'food_tomato', name: '番茄', expireDate: soon },
          { id: 'food_egg', name: '鸡蛋', expireDate: later },
        ]),
      },
      recipeSuggestionRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rule_popular',
            name: '鸡蛋羹',
            requiredIngredients: ['鸡蛋'],
            difficulty: RecipeDifficulty.easy,
            estimatedMinutes: 10,
            reasonTemplate: '简单',
            popularityScore: 200,
          },
          {
            id: 'rule_expiring',
            name: '番茄炒蛋',
            requiredIngredients: ['番茄', '鸡蛋'],
            difficulty: RecipeDifficulty.easy,
            estimatedMinutes: 15,
            reasonTemplate: '优先消耗番茄',
            popularityScore: 10,
          },
        ]),
      },
    }
    const service = new RecipeSuggestionService(prisma as never)
    const result = await service.suggestByFridge('fridge_1')

    expect(result[0]?.name).toBe('番茄炒蛋')
  })
})
