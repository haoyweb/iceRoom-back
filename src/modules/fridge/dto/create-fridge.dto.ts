import { ApiProperty } from '@nestjs/swagger'
import { IsString, Length } from 'class-validator'

export class CreateFridgeDto {
  @ApiProperty({ example: '家用冰箱' })
  @IsString()
  @Length(1, 40)
  name!: string

  @ApiProperty({ example: 'user_demo' })
  @IsString()
  @Length(1, 64)
  userId!: string
}
