import { ApiProperty } from '@nestjs/swagger'
import { ArrayMinSize, IsArray, IsString } from 'class-validator'

export class RecipeSuggestionQueryDto {
  @ApiProperty({ example: ['番茄', '鸡蛋'], type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ingredients!: string[]
}
