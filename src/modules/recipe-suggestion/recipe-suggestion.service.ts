import { HttpStatus, Injectable } from '@nestjs/common'
import type { FoodItem } from '@prisma/client'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import type { FoodExpiryLevel } from '@/common/utils/expiry'
import { getExpiryScore, withExpiryInfo } from '@/common/utils/expiry'
import { PrismaService } from '@/database/prisma.service'

interface FoodWithExpiryInfo extends Pick<FoodItem, 'id' | 'name' | 'expireDate'> {
  daysToExpire: number
  expiryLevel: FoodExpiryLevel
}

@Injectable()
export class RecipeSuggestionService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const rule = await this.prisma.recipeSuggestionRule.findUnique({ where: { id } })
    if (!rule) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '菜谱不存在', HttpStatus.NOT_FOUND)
    }
    return rule
  }

  async suggest(ingredients: string[]) {
    const normalizedIngredients = new Set(ingredients.map((item) => item.trim()).filter(Boolean))
    const rules = await this.prisma.recipeSuggestionRule.findMany({
      orderBy: [{ popularityScore: 'desc' }, { estimatedMinutes: 'asc' }],
    })

    return rules
      .map((rule) => {
        const matchedIngredients = rule.requiredIngredients.filter((item) => normalizedIngredients.has(item))
        const missingIngredients = rule.requiredIngredients.filter((item) => !normalizedIngredients.has(item))

        return {
          id: rule.id,
          name: rule.name,
          matchedIngredients,
          missingIngredients,
          difficulty: rule.difficulty,
          estimatedMinutes: rule.estimatedMinutes,
          reason: rule.reasonTemplate,
          popularityScore: rule.popularityScore,
        }
      })
      .filter((item) => item.matchedIngredients.length > 0)
      .sort((a, b) => b.matchedIngredients.length - a.matchedIngredients.length || a.missingIngredients.length - b.missingIngredients.length || b.popularityScore - a.popularityScore)
  }

  async suggestByFridge(fridgeId: string, limit = 10) {
    const fridge = await this.prisma.fridge.findUnique({
      where: { id: fridgeId },
      select: { id: true },
    })

    if (!fridge) {
      throw new BusinessException(ErrorCode.FRIDGE_NOT_FOUND, '冰箱不存在', HttpStatus.NOT_FOUND)
    }

    const foods = await this.prisma.foodItem.findMany({
      where: {
        fridgeId,
        status: 'normal',
      },
      select: { id: true, name: true, expireDate: true },
    })
    const foodsWithExpiryInfo: FoodWithExpiryInfo[] = foods.map((food) => withExpiryInfo(food))
    const foodMap = new Map<string, FoodWithExpiryInfo[]>()

    for (const food of foodsWithExpiryInfo) {
      foodMap.set(food.name, [...(foodMap.get(food.name) ?? []), food])
    }

    // 把"用户冰箱里有的食材名"放到 SQL 层做匹配筛选：只有 requiredIngredients 与
    // 用户食材有交集（PostgreSQL 数组 hasSome）的规则才进入排序池，从 364 条降到
    // 通常 ≤100 条，再 JS 端排序后 slice。在没有食材时直接返回空数组。
    const userIngredients = [...foodMap.keys()]
    if (userIngredients.length === 0) return []

    const rules = await this.prisma.recipeSuggestionRule.findMany({
      where: { requiredIngredients: { hasSome: userIngredients } },
      orderBy: [{ popularityScore: 'desc' }, { estimatedMinutes: 'asc' }],
    })

    return rules
      .map((rule) => {
        const matchedFoods = rule.requiredIngredients.flatMap((ingredient) => foodMap.get(ingredient) ?? [])
        const matchedIngredients = [...new Set(matchedFoods.map((food) => food.name))]
        const missingIngredients = rule.requiredIngredients.filter((ingredient) => !foodMap.has(ingredient))
        const expiringScore = matchedFoods.reduce((score, food) => score + getExpiryScore(food.daysToExpire), 0)
        const usedExpiringFoodIds = matchedFoods.filter((food) => food.daysToExpire <= 7).map((food) => food.id)

        return {
          id: rule.id,
          name: rule.name,
          matchedIngredients,
          missingIngredients,
          matchedFoods: matchedFoods.map((food) => ({
            id: food.id,
            name: food.name,
            expireDate: food.expireDate.toISOString(),
            daysToExpire: food.daysToExpire,
            expiryLevel: food.expiryLevel,
          })),
          usedExpiringFoodIds,
          expiringScore,
          difficulty: rule.difficulty,
          estimatedMinutes: rule.estimatedMinutes,
          reason: rule.reasonTemplate,
          popularityScore: rule.popularityScore,
        }
      })
      .sort(
        (a, b) =>
          b.expiringScore - a.expiringScore ||
          b.matchedFoods.length - a.matchedFoods.length ||
          a.missingIngredients.length - b.missingIngredients.length ||
          b.popularityScore - a.popularityScore ||
          a.estimatedMinutes - b.estimatedMinutes,
      )
      .slice(0, limit)
  }
}
