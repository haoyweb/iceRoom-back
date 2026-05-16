import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString, Length, Matches } from 'class-validator'

export class RegisterDto {
  @ApiProperty({ example: 'alice', minLength: 3, maxLength: 32, description: '登录账号；字母数字下划线' })
  @IsString()
  @Length(3, 32)
  // 限定字符集是为了避免 username 包含路径敏感字符（/、空格、@）干扰未来 URL 设计；
  // 同时排除中文/emoji，因为它们更适合放 nickname。
  @Matches(/^[a-zA-Z0-9_]+$/, { message: '用户名仅支持字母、数字、下划线' })
  username!: string

  @ApiProperty({ example: 'password123', minLength: 6, maxLength: 64 })
  @IsString()
  @Length(6, 64)
  password!: string

  @ApiProperty({ example: '我家', required: false, description: '展示用昵称；为空时前端用 username 兜底' })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  nickname?: string
}
