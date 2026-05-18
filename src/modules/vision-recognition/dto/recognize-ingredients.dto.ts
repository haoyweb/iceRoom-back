import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString, Length, ValidateIf } from 'class-validator'

export type RecognitionSourceType = 'auto' | 'photo' | 'receipt' | 'screenshot' | 'package'

export class RecognizeIngredientsDto {
  @ApiPropertyOptional({ description: 'Fridge id for ownership context.' })
  @IsOptional()
  @IsString()
  fridgeId?: string

  @ApiPropertyOptional({ description: 'Default shelf id for recognized drafts.' })
  @ValidateIf((data: RecognizeIngredientsDto) => data.shelfId !== undefined)
  @IsString()
  shelfId?: string

  @ApiPropertyOptional({ description: 'Short recognition context to improve model output.', maxLength: 300 })
  @IsOptional()
  @IsString()
  @Length(1, 300)
  context?: string

  @ApiPropertyOptional({ description: 'Recognition locale.', default: 'zh-CN' })
  @IsOptional()
  @IsString()
  @IsIn(['zh-CN'])
  locale?: string

  @ApiPropertyOptional({ description: 'Image source type.', enum: ['auto', 'photo', 'receipt', 'screenshot', 'package'], default: 'auto' })
  @IsOptional()
  @IsString()
  @IsIn(['auto', 'photo', 'receipt', 'screenshot', 'package'])
  sourceType?: RecognitionSourceType
}
