import { ApiProperty } from '@nestjs/swagger'
import { IsString } from 'class-validator'

export class RecipeSuggestionByFridgeDto {
  @ApiProperty({ example: 'fridge_demo' })
  @IsString()
  fridgeId!: string
}
