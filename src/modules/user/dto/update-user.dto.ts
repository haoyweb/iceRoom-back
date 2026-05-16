import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsUrl, Length } from 'class-validator'

/**
 * 「我的」页面用户可编辑的字段。username/passwordHash 通过专门的接口走，
 * 这里只允许改个性化字段，防止误改账号关键信息。
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: '我的昵称' })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  nickname?: string

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.png' })
  @IsOptional()
  @IsString()
  // IsUrl 允许 https://、http://，这里不做严格 host 限制——预留未来允许用户自定义图床
  @IsUrl({ require_protocol: true })
  avatar?: string
}
