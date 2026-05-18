import { HttpStatus, Injectable } from '@nestjs/common'
import type { FoodItem, Prisma, RecipeSuggestionRule } from '@prisma/client'
import { createPageResult } from '@/common/dto/page.dto'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import type { FoodExpiryLevel } from '@/common/utils/expiry'
import { getExpiryScore, withExpiryInfo } from '@/common/utils/expiry'
import { PrismaService } from '@/database/prisma.service'
import { RecipeOrderBy } from './dto/recipe-list-query.dto'
import type { RecipeListQueryDto } from './dto/recipe-list-query.dto'

interface FoodWithExpiryInfo extends Pick<FoodItem, 'id' | 'name' | 'expireDate'> {
  daysToExpire: number
  expiryLevel: FoodExpiryLevel
}

@Injectable()
export class RecipeSuggestionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: RecipeListQueryDto) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const orderByKey = query.orderBy ?? RecipeOrderBy.popular

    const where: Prisma.RecipeSuggestionRuleWhereInput = {}
    if (query.category) where.category = query.category
    if (query.difficulty) where.difficulty = query.difficulty
    if (query.keyword) where.name = { contains: query.keyword, mode: 'insensitive' }

    const orderBy: Prisma.RecipeSuggestionRuleOrderByWithRelationInput[] =
      orderByKey === RecipeOrderBy.fast
        ? [{ estimatedMinutes: 'asc' }, { popularityScore: 'desc' }]
        : orderByKey === RecipeOrderBy.newest
          ? [{ createdAt: 'desc' }]
          : [{ popularityScore: 'desc' }, { estimatedMinutes: 'asc' }]

    const [list, total] = await Promise.all([
      this.prisma.recipeSuggestionRule.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        // 列表展示用的字段：故意不返回 instructions / tips / sourceRefUrl / reasonTemplate，
        // 让 payload 保持精简。详情页通过 :id 拿完整数据。
        select: {
          id: true,
          name: true,
          difficulty: true,
          estimatedMinutes: true,
          imageUrl: true,
          popularityScore: true,
          category: true,
          requiredIngredients: true,
        },
      }),
      this.prisma.recipeSuggestionRule.count({ where }),
    ])

    return createPageResult(list, total, page, pageSize)
  }

  async findById(id: string, fridgeId?: string) {
    const rule = await this.prisma.recipeSuggestionRule.findUnique({ where: { id } })
    if (!rule) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '菜谱不存在', HttpStatus.NOT_FOUND)
    }

    if (!fridgeId) {
      return rule
    }

    const foodMap = await this.getFoodMapByFridge(fridgeId)
    const match = this.buildRecipeMatch(rule, foodMap)
    return { ...rule, ...match }
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
    const foodMap = await this.getFoodMapByFridge(fridgeId)

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
        const match = this.buildRecipeMatch(rule, foodMap)
        return {
          id: rule.id,
          name: rule.name,
          ...match,
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

  private async getFoodMapByFridge(fridgeId: string) {
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
    const foodMap = new Map<string, FoodWithExpiryInfo[]>()

    for (const food of foods.map(item => withExpiryInfo(item))) {
      foodMap.set(food.name, [...(foodMap.get(food.name) ?? []), food])
    }

    return foodMap
  }

  private buildRecipeMatch(rule: RecipeSuggestionRule, foodMap: Map<string, FoodWithExpiryInfo[]>) {
    const matchedFoods = rule.requiredIngredients.flatMap((ingredient) => foodMap.get(ingredient) ?? [])
    const matchedIngredients = [...new Set(matchedFoods.map(food => food.name))]
    const missingIngredients = rule.requiredIngredients.filter(ingredient => !foodMap.has(ingredient))
    const expiringScore = matchedFoods.reduce((score, food) => score + getExpiryScore(food.daysToExpire), 0)
    const usedExpiringFoodIds = matchedFoods.filter(food => food.daysToExpire <= 7).map(food => food.id)

    return {
      matchedIngredients,
      missingIngredients,
      matchedFoods: matchedFoods.map(food => ({
        id: food.id,
        name: food.name,
        expireDate: food.expireDate.toISOString(),
        daysToExpire: food.daysToExpire,
        expiryLevel: food.expiryLevel,
      })),
      usedExpiringFoodIds,
      expiringScore,
    }
  }
}
