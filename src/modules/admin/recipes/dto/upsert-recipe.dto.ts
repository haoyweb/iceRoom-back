import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { RecipeDifficulty } from '@prisma/client'
import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength } from 'class-validator'

/**
 * 菜谱创建 DTO（对齐 RecipeSuggestionRule 表字段）。
 *
 * Update DTO 用 PartialType 继承，省一份重复字段定义。
 * 数组长度上限是为了防止前端误粘贴大段文本——单菜谱不应有 50+ 食材或 100 步。
 * stepImages / portions 用 `Object` 接 JSON：MVP 不做嵌套结构校验，由运营自己保证 JSON 合法性。
 */
export class CreateRecipeDto {
  @ApiProperty({ description: '菜谱名（全库唯一）', example: '番茄炒蛋' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string

  @ApiProperty({ type: [String], description: '必备食材' })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  requiredIngredients!: string[]

  @ApiPropertyOptional({ type: [String], description: '可选食材' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  optionalIngredients?: string[]

  @ApiPropertyOptional({ type: [String], description: '允许缺失的食材（推荐时不扣分）' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  missingIngredients?: string[]

  @ApiProperty({ enum: RecipeDifficulty })
  @IsEnum(RecipeDifficulty)
  difficulty!: RecipeDifficulty

  @ApiProperty({ description: '预计耗时（分钟）', example: 15 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  estimatedMinutes!: number

  @ApiProperty({ description: '推荐理由模板', example: '冰箱里 {ingredients} 都有，15 分钟出锅。' })
  @IsString()
  @MaxLength(200)
  reasonTemplate!: string

  @ApiPropertyOptional({ description: '人气分（用于排序）', example: 80 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  popularityScore?: number

  @ApiPropertyOptional({ description: '来源标识：seed / howtocook / 等' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string

  @ApiPropertyOptional({ description: '分类：meat_dish / vegetable_dish / staple / seed / ...' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string

  @ApiPropertyOptional({ type: [String], description: '操作步骤' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  instructions?: string[]

  @ApiPropertyOptional({ description: '步骤图（key 是 stepIndex 字符串）' })
  @IsOptional()
  @IsObject()
  stepImages?: Record<string, unknown>

  @ApiPropertyOptional({ description: '用料计算表（自由 JSON）' })
  @IsOptional()
  @IsObject()
  portions?: Record<string, unknown>

  @ApiPropertyOptional({ description: '小贴士' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  tips?: string

  @ApiPropertyOptional({ description: '菜谱配图（R2 公开 URL）' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  imageUrl?: string

  @ApiPropertyOptional({ description: '图源 URL（溯源 fallback）' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  imageSourceUrl?: string

  @ApiPropertyOptional({ description: '原文教程链接' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  sourceRefUrl?: string
}

export class UpdateRecipeDto extends PartialType(CreateRecipeDto) {}
