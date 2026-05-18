import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

export class RecipeDetailQueryDto {
  @ApiPropertyOptional({ description: '当前用户冰箱 ID；传入后返回该冰箱维度的食材匹配结果。', example: 'fridge_demo' })
  @IsOptional()
  @IsString()
  fridgeId?: string
}
