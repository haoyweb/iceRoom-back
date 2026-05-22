import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

/**
 * 封禁请求体。
 *
 * reason 限制 1-200 字符——既给操作人留足记录空间，又避免被滥用塞大段文本。
 * 字段可选——批量场景下允许「不写理由直接封」，仍然会把 bannedAt 写上。
 */
export class BanUserDto {
  @ApiProperty({ required: false, description: '封禁原因（1-200 字符）', example: '违规上传敏感内容' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  reason?: string
}
