import { ApiProperty } from '@nestjs/swagger'
import { IsArray, IsString } from 'class-validator'

export class RecipeSuggestionQueryDto {
  @ApiProperty({ example: ['番茄', '鸡蛋'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  ingredients!: string[]
}
