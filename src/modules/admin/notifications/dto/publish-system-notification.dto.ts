import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator'

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value
}

export class PublishSystemNotificationDto {
  @ApiProperty({ description: '通知标题，1-80 字' })
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @Length(1, 80)
  title!: string

  @ApiProperty({ description: '通知内容，1-1000 字' })
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @Length(1, 1000)
  content!: string

  @ApiPropertyOptional({ description: '客户端请求幂等 ID，防重复提交' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientRequestId?: string
}
