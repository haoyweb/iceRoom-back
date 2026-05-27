import { Injectable } from '@nestjs/common'
import { FoodStatus } from '@prisma/client'
import { FoodService } from '../food/food.service'
import { FridgeService } from '../fridge/fridge.service'
import { RecipeSuggestionService } from '../recipe-suggestion/recipe-suggestion.service'
import type { TodayActionDto } from './dto/today-action.dto'

interface FoodSnapshot {
  id: string
  name: string
  daysToExpire: number
}

interface RecipeSnapshot {
  id: string
  name: string
  usedExpiringFoodIds: string[]
}

/**
 * 首页聚合服务。
 *
 * 职责：把"临期食材"与"菜谱推荐"两条上游数据组合成可直接渲染的「今日处理建议」摘要。
 *
 * 复用策略：
 *  - FoodService.listExpiring：已带 FoodReminder 过滤（阶段 3 接入）。
 *  - RecipeSuggestionService.suggestByFridge：同样带 reminder 过滤，菜谱不会再用被忽略的食材。
 *  - 鉴权通过 FridgeService.ensureFridgeOwnedByUser 兜底，不允许查别人的冰箱摘要。
 *
 * 文案/优先级判定与前端 fridgeService.toTodayAction 保持一致（已迁移过来）。
 * 前端原 toTodayAction 标记 @deprecated 后只作降级路径保留。
 */
@Injectable()
export class HomeService {
  constructor(
    private readonly fridgeService: FridgeService,
    private readonly foodService: FoodService,
    private readonly recipeSuggestionService: RecipeSuggestionService,
  ) {}

  async getToday(fridgeId: string, userId: string): Promise<TodayActionDto> {
    await this.fridgeService.ensureFridgeOwnedByUser(fridgeId, userId)

    const [expiringPage, recipes] = await Promise.all([
      this.foodService.listExpiring(
        { fridgeId, days: 7, includeExpired: true, status: FoodStatus.normal, page: 1, pageSize: 100 },
        userId,
      ),
      this.recipeSuggestionService.suggestByFridge(fridgeId, 3),
    ])

    return this.buildTodayAction(expiringPage.list, recipes)
  }

  /**
   * 推导逻辑（与前端 toTodayAction 对齐）：
   * 1) 把 daysToExpire ≤ 3 的食材当 urgent。
   * 2) 优先选命中 urgent 食材的菜谱；否则退回到第一条推荐。
   * 3) primaryFoods：菜谱命中的 urgent 食材，没命中就取 urgentFoods 前 3 个，
   *    作为 UI 标题里"优先处理 xx、xx、xx"的渲染依据。
   * 4) 文案按紧急度分支：已过期 → today → 3 天内。无 urgent 时另出"轻松"文案。
   */
  private buildTodayAction(foods: FoodSnapshot[], recipes: RecipeSnapshot[]): TodayActionDto {
    const urgentFoods = foods.filter(food => food.daysToExpire <= 3)
    const expiredCount = urgentFoods.filter(food => food.daysToExpire < 0).length
    const todayCount = urgentFoods.filter(food => food.daysToExpire === 0).length
    const within3DaysCount = urgentFoods.filter(food => food.daysToExpire > 0 && food.daysToExpire <= 3).length

    const urgentFoodIds = new Set(urgentFoods.map(food => food.id))
    const recipe = recipes.find(item => item.usedExpiringFoodIds.some(id => urgentFoodIds.has(id))) ?? recipes[0]
    const recipeFoodIds = recipe?.usedExpiringFoodIds.filter(id => urgentFoodIds.has(id)) ?? []
    const primaryFoods = recipeFoodIds.length
      ? urgentFoods.filter(food => recipeFoodIds.includes(food.id))
      : urgentFoods.slice(0, 3)
    const primaryFoodNames = primaryFoods.map(food => food.name)
    const primaryFoodIds = primaryFoods.map(food => food.id)
    const foodText = primaryFoodNames.length ? `：${primaryFoodNames.join('、')}` : ''

    if (!urgentFoods.length) {
      return {
        expiredCount,
        todayCount,
        within3DaysCount,
        urgentCount: 0,
        primaryFoodIds,
        primaryFoodNames,
        title: '今天没有必须处理的食材',
        description: recipe ? `可以顺手做一道${recipe.name}，继续保持冰箱周转。` : '库存状态不错，可以按计划补充常用食材。',
        recipeId: recipe?.id ?? null,
      }
    }

    const title = expiredCount > 0
      ? `${expiredCount} 件食材已过期，建议先确认`
      : todayCount > 0
        ? `${todayCount} 件食材今天到期`
        : `${within3DaysCount} 件食材 3 天内到期`
    const description = recipe
      ? `优先处理${foodText}，现在可以做${recipe.name}。`
      : `优先处理${foodText}，用完后记得标记「已用完」。`

    return {
      expiredCount,
      todayCount,
      within3DaysCount,
      urgentCount: urgentFoods.length,
      primaryFoodIds,
      primaryFoodNames,
      title,
      description,
      recipeId: recipe?.id ?? null,
    }
  }
}
