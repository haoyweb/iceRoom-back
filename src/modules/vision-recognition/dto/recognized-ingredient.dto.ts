import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { FoodCategory } from '@prisma/client'

export type RecognizedSourceType = 'photo' | 'receipt' | 'screenshot' | 'package' | 'unknown'

export class RecognizedIngredientDto {
  @ApiProperty({ description: 'Normalized ingredient name.', example: '鸡蛋' })
  name!: string

  @ApiPropertyOptional({ description: 'Raw name recognized from receipt, screenshot, or package.', example: '本地鲜鸡蛋15枚' })
  rawName?: string

  @ApiProperty({ enum: FoodCategory, description: 'Normalized food category.' })
  category!: FoodCategory

  @ApiPropertyOptional({ description: 'Recognized quantity.', example: 3 })
  quantity?: number

  @ApiPropertyOptional({ description: 'Recognized quantity unit.', example: '个' })
  unit?: string

  @ApiPropertyOptional({ description: 'Suggested freshness days from today.', example: 5 })
  freshnessDays?: number

  @ApiPropertyOptional({ description: 'Recognition confidence from 0 to 1.', example: 0.91 })
  confidence?: number

  @ApiPropertyOptional({ description: 'Short note for user confirmation.' })
  note?: string
}

export class IgnoredRecognitionItemDto {
  @ApiProperty({ description: 'Ignored raw text.', example: '购物袋' })
  text!: string

  @ApiProperty({ description: 'Reason why this text is ignored.', example: '非食材' })
  reason!: string
}

export class RecognizeIngredientsResultDto {
  @ApiProperty({ description: 'Vision provider name.', example: 'qwen' })
  provider!: string

  @ApiProperty({ description: 'Vision model name.', example: 'qwen3-vl-flash' })
  model!: string

  @ApiProperty({ description: 'Detected image source type.', enum: ['photo', 'receipt', 'screenshot', 'package', 'unknown'] })
  sourceType!: RecognizedSourceType

  @ApiProperty({ type: [RecognizedIngredientDto] })
  items!: RecognizedIngredientDto[]

  @ApiPropertyOptional({ type: [IgnoredRecognitionItemDto], description: 'Texts intentionally ignored as non-inventory items.' })
  ignored?: IgnoredRecognitionItemDto[]

  @ApiPropertyOptional({ type: [String], description: 'Non-blocking recognition warnings.' })
  warnings?: string[]

  // Provider 用量。Provider 拿不到时全 undefined，service 会写 null 到 DB，前端用 "-" 兜底。
  @ApiPropertyOptional({ description: 'Provider input tokens.' })
  inputTokens?: number

  @ApiPropertyOptional({ description: 'Provider output tokens.' })
  outputTokens?: number

  @ApiPropertyOptional({ description: 'Provider total tokens.' })
  totalTokens?: number
}
