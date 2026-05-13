import { ApiProperty } from '@nestjs/swagger'
import { IsString, Length } from 'class-validator'

export class CreateUserDto {
  @ApiProperty({ example: '家庭用户' })
  @IsString()
  @Length(1, 40)
  nickname!: string
}
