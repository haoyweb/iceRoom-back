import { HttpStatus, Injectable } from '@nestjs/common'
import type { FoodItem } from '@prisma/client'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { PrismaService } from '@/database/prisma.service'
import type { FoodExpiryLevel } from '@/modules/food/food.types'

interface FoodWithExpiryInfo extends Pick<FoodItem, 'id' | 'name' | 'expireDate'> {
  daysToExpire: number
  expiryLevel: FoodExpiryLevel
}

@Injectable()
export class RecipeSuggestionService {
  constructor(private readonly prisma: PrismaService) {}

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

  async suggestByFridge(fridgeId: string) {
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
    const foodsWithExpiryInfo = foods.map((food) => this.withExpiryInfo(food))
    const foodMap = new Map<string, FoodWithExpiryInfo[]>()

    for (const food of foodsWithExpiryInfo) {
      foodMap.set(food.name, [...(foodMap.get(food.name) ?? []), food])
    }

    const rules = await this.prisma.recipeSuggestionRule.findMany({
      orderBy: [{ popularityScore: 'desc' }, { estimatedMinutes: 'asc' }],
    })

    return rules
      .map((rule) => {
        const matchedFoods = rule.requiredIngredients.flatMap((ingredient) => foodMap.get(ingredient) ?? [])
        const matchedIngredients = [...new Set(matchedFoods.map((food) => food.name))]
        const missingIngredients = rule.requiredIngredients.filter((ingredient) => !foodMap.has(ingredient))
        const expiringScore = matchedFoods.reduce((score, food) => score + this.getExpiryScore(food.daysToExpire), 0)
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
      .filter((item) => item.matchedFoods.length > 0)
      .sort(
        (a, b) =>
          b.expiringScore - a.expiringScore ||
          b.matchedFoods.length - a.matchedFoods.length ||
          a.missingIngredients.length - b.missingIngredients.length ||
          b.popularityScore - a.popularityScore ||
          a.estimatedMinutes - b.estimatedMinutes,
      )
  }

  private withExpiryInfo(food: Pick<FoodItem, 'id' | 'name' | 'expireDate'>): FoodWithExpiryInfo {
    const daysToExpire = this.getDaysToExpire(food.expireDate)

    return {
      ...food,
      daysToExpire,
      expiryLevel: this.getExpiryLevel(daysToExpire),
    }
  }

  private getDaysToExpire(expireDate: Date) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const target = new Date(expireDate)
    target.setHours(0, 0, 0, 0)

    return Math.ceil((target.getTime() - today.getTime()) / 86_400_000)
  }

  private getExpiryLevel(daysToExpire: number): FoodExpiryLevel {
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

  private getExpiryScore(daysToExpire: number) {
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
}
