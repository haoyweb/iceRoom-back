import { ApiPropertyOptional } from '@nestjs/swagger'
import { FoodCategory, FoodStatus } from '@prisma/client'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { PageQueryDto } from '@/common/dto/page.dto'

export class FoodQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: FoodCategory })
  @IsOptional()
  @IsEnum(FoodCategory)
  category?: FoodCategory

  @ApiPropertyOptional({ enum: FoodStatus })
  @IsOptional()
  @IsEnum(FoodStatus)
  status?: FoodStatus

  @ApiPropertyOptional({ example: 'fridge_demo' })
  @IsOptional()
  @IsString()
  fridgeId?: string
}
