import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class RecipeSuggestionByFridgeDto {
  @ApiProperty({ example: 'fridge_demo' })
  @IsString()
  fridgeId!: string

  @ApiPropertyOptional({
    description: '返回菜谱数量上限，默认 10，最大 50。前端首页只展示 3 条，但接口预留余量给"换一组"等交互。',
    example: 10,
    minimum: 1,
    maximum: 50,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number
}
