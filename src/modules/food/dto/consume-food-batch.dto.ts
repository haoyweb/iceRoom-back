import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator'

export class ConsumeFoodItemDto {
  @ApiProperty({ example: 'food_demo' })
  @IsString()
  foodId!: string

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity!: number
}

export class ConsumeFoodBatchDto {
  @ApiPropertyOptional({ example: '番茄炒蛋' })
  @IsOptional()
  @IsString()
  recipeName?: string

  @ApiProperty({ type: [ConsumeFoodItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConsumeFoodItemDto)
  items!: ConsumeFoodItemDto[]
}
