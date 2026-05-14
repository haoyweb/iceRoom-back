import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { RecipeDifficulty } from '@prisma/client'

/**
 * 菜谱列表筛选/排序参数。
 *
 * 前端列表页用 chip 切换分类/难度，下拉切换排序方式。
 * keyword 走简单的 PostgreSQL contains（mode insensitive），不引入全文索引以避免迁移成本。
 */
export enum RecipeOrderBy {
  popular = 'popular',
  fast = 'fast',
  newest = 'newest',
}

export class RecipeListQueryDto {
  @ApiPropertyOptional({ description: '分类（aquatic/breakfast/dessert/meat_dish/staple/vegetable_dish/...）' })
  @IsOptional()
  @IsString()
  category?: string

  @ApiPropertyOptional({ enum: RecipeDifficulty, description: '难度筛选' })
  @IsOptional()
  @IsEnum(RecipeDifficulty)
  difficulty?: RecipeDifficulty

  @ApiPropertyOptional({ description: '按菜名模糊搜索' })
  @IsOptional()
  @IsString()
  keyword?: string

  @ApiPropertyOptional({ enum: RecipeOrderBy, default: RecipeOrderBy.popular, description: 'popular=按热度，fast=按时长升序，newest=按创建时间倒序' })
  @IsOptional()
  @IsEnum(RecipeOrderBy)
  orderBy?: RecipeOrderBy

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number
}
