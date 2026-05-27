import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/**
 * 首页"今日处理建议"摘要响应。
 *
 * 设计原则：只返回计数 / id / 文案，不返回完整 recipe 字段——展示层转换（cookTime 字符串、tags 拼接）
 * 是前端职责。前端拿到 recipeId 后从同次拉取的 recipe-suggestions 列表里查完整 RecipeItem。
 *
 * 字段语义与前端 TodayActionSuggestion 类型 1:1 对齐（除 recipe 改为 recipeId）。
 */
export class TodayActionDto {
  @ApiProperty({ example: 0, description: 'Foods already past expireDate (daysToExpire < 0).' })
  expiredCount!: number

  @ApiProperty({ example: 1, description: 'Foods expiring today (daysToExpire === 0).' })
  todayCount!: number

  @ApiProperty({ example: 2, description: 'Foods expiring within 1-3 days.' })
  within3DaysCount!: number

  @ApiProperty({ example: 3, description: 'Total urgent foods (expired + today + within3Days).' })
  urgentCount!: number

  @ApiProperty({ example: ['food_001', 'food_002'], description: 'Primary food IDs to highlight.' })
  primaryFoodIds!: string[]

  @ApiProperty({ example: ['番茄', '青菜'], description: 'Primary food names matching primaryFoodIds in same order.' })
  primaryFoodNames!: string[]

  @ApiProperty({ example: '3 件食材 3 天内到期' })
  title!: string

  @ApiProperty({ example: '优先处理：番茄、青菜，现在可以做番茄炒蛋。' })
  description!: string

  @ApiPropertyOptional({ example: 'recipe_001', description: 'Top-matched recipe rule ID; null when no recipe available.', nullable: true })
  recipeId!: string | null
}
