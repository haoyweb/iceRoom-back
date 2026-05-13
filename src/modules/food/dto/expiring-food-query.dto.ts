import { ApiPropertyOptional } from '@nestjs/swagger'
import { FoodStatus } from '@prisma/client'
import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

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
}
