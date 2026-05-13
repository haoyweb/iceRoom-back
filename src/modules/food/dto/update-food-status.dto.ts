import { ApiProperty } from '@nestjs/swagger'
import { FoodStatus } from '@prisma/client'
import { IsEnum } from 'class-validator'

export class UpdateFoodStatusDto {
  @ApiProperty({ enum: FoodStatus, example: FoodStatus.consumed })
  @IsEnum(FoodStatus)
  status!: FoodStatus
}
