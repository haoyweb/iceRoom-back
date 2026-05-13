import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

export class ListFridgeDto {
  @ApiPropertyOptional({ example: 'user_demo', description: '按用户筛选冰箱列表' })
  @IsOptional()
  @IsString()
  userId?: string
}
