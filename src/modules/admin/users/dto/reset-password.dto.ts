import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength, MinLength } from 'class-validator'

/**
 * 重置密码请求体。
 *
 * 长度限制 6-20 与 C 端注册一致；不做强度校验（混合大小写/数字/符号）——
 * MVP 阶段简单可靠优先，强度规则后续按用户反馈再加。
 */
export class ResetPasswordDto {
  @ApiProperty({ description: '新密码（6-20 位）', example: 'abc123456' })
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  newPassword!: string
}
