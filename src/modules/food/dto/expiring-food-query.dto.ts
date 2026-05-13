import { ApiPropertyOptional } from '@nestjs/swagger'
import { FoodStatus } from '@prisma/client'
import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { MAX_PAGE_SIZE } from '@/common/constants/app.constants'

function toBoolean(value: unknown) {
  if (value === undefined) {
    return undefined
  }

  return value === true || value === 'true' || value === '1'
}

export class ExpiringFoodQueryDto {
  @ApiPropertyOptional({ example: 'fridge_demo' })
  @IsOptional()
  @IsString()
  fridgeId?: string

  @ApiPropertyOptional({ example: 7, default: 7, maximum: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  days?: number = 7

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  includeExpired?: boolean = true

  @ApiPropertyOptional({ enum: FoodStatus, example: FoodStatus.normal })
  @IsOptional()
  @IsEnum(FoodStatus)
  status?: FoodStatus = FoodStatus.normal

  @ApiPropertyOptional({ example: 1, default: 1, description: '页码，从 1 开始' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @ApiPropertyOptional({ example: 100, default: 100, maximum: MAX_PAGE_SIZE, description: '每页大小' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number = 100
}
