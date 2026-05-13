import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { FoodCategory } from '@prisma/client'
import { Type } from 'class-transformer'
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator'

export class CreateFoodDto {
  @ApiProperty({ example: '番茄' })
  @IsString()
  @Length(1, 40)
  name!: string

  @ApiProperty({ enum: FoodCategory, example: FoodCategory.vegetable })
  @IsEnum(FoodCategory)
  category!: FoodCategory

  @ApiProperty({ example: 'fridge_demo' })
  @IsString()
  fridgeId!: string

  @ApiProperty({ example: 'shelf_demo' })
  @IsString()
  shelfId!: string

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity?: number

  @ApiPropertyOptional({ example: '个' })
  @IsOptional()
  @IsString()
  @Length(1, 12)
  unit?: string

  @ApiPropertyOptional({ example: '2026-05-12T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  purchaseDate?: string

  @ApiPropertyOptional({ example: '2026-05-15T00:00:00.000Z', description: '不传时后端会根据食材和层位自动估算' })
  @IsOptional()
  @IsDateString()
  expireDate?: string

  @ApiPropertyOptional({ example: '已开封，优先吃' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  note?: string
}
