/**
 * 注意：CreateUserDto 已不再被 controller 直接消费。AuthService.register 直接构造
 * `{ username, passwordHash, nickname }` 调 prisma，跳过这个 DTO。
 *
 * 保留这个文件是为了向后兼容现有 user.service.spec.ts，避免在 B4/B5 范围之外牵连测试。
 * 后续清理周期可以连同 user.service.create 一起删除。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, Length, Matches } from 'class-validator'

export class CreateUserDto {
  @ApiProperty({ example: 'alice' })
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_]+$/)
  username!: string

  @ApiProperty({ example: 'hashed_pwd_or_plain_if_via_register' })
  @IsString()
  passwordHash!: string

  @ApiPropertyOptional({ example: '家庭用户' })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  nickname?: string
}
