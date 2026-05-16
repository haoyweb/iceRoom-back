import { ApiProperty } from '@nestjs/swagger'
import { IsString, Length } from 'class-validator'

export class LoginDto {
  @ApiProperty({ example: 'alice' })
  @IsString()
  @Length(3, 32)
  username!: string

  @ApiProperty({ example: 'password123' })
  @IsString()
  @Length(6, 64)
  password!: string
}
