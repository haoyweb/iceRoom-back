import { ApiProperty } from '@nestjs/swagger'
import { IsString } from 'class-validator'

export class RefreshDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...', description: '登录时颁发的 refresh token' })
  @IsString()
  refreshToken!: string
}
