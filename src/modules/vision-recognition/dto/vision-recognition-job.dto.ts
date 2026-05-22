import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { VisionRecognitionStatus } from '@prisma/client'
import type { IgnoredRecognitionItemDto, RecognizedIngredientDto, RecognizedSourceType } from './recognized-ingredient.dto'
import type { RecognitionSourceType } from './recognize-ingredients.dto'

export class CreateIngredientRecognitionJobResultDto {
  @ApiProperty()
  id!: string

  @ApiProperty({ enum: VisionRecognitionStatus })
  status!: VisionRecognitionStatus

  @ApiPropertyOptional()
  fridgeId?: string | null

  @ApiPropertyOptional()
  shelfId?: string | null

  @ApiProperty({ enum: ['auto', 'photo', 'receipt', 'screenshot', 'package'] })
  requestedSourceType!: RecognitionSourceType

  @ApiProperty()
  createdAt!: Date
}

export class IngredientRecognitionJobListItemDto {
  @ApiProperty()
  id!: string

  @ApiProperty({ enum: VisionRecognitionStatus })
  status!: VisionRecognitionStatus

  @ApiPropertyOptional()
  fridgeId?: string | null

  @ApiPropertyOptional()
  shelfId?: string | null

  @ApiProperty({ enum: ['auto', 'photo', 'receipt', 'screenshot', 'package'] })
  requestedSourceType!: string

  @ApiPropertyOptional({ enum: ['photo', 'receipt', 'screenshot', 'package', 'unknown'] })
  detectedSourceType?: RecognizedSourceType | null

  @ApiPropertyOptional()
  provider?: string | null

  @ApiPropertyOptional()
  model?: string | null

  @ApiProperty()
  itemCount!: number

  @ApiProperty()
  warningCount!: number

  @ApiPropertyOptional()
  imageUrl?: string | null

  @ApiPropertyOptional()
  imageExpiresAt?: Date | null

  @ApiPropertyOptional()
  errorMessage?: string | null

  @ApiPropertyOptional()
  confirmedAt?: Date | null

  @ApiProperty()
  createdAt!: Date

  @ApiProperty()
  updatedAt!: Date
}

export class IngredientRecognitionJobDetailDto extends IngredientRecognitionJobListItemDto {
  @ApiProperty({ type: Array })
  items!: RecognizedIngredientDto[]

  @ApiProperty({ type: Array })
  ignored!: IgnoredRecognitionItemDto[]

  @ApiProperty({ type: [String] })
  warnings!: string[]
}
