import { ApiPropertyOptional } from '@nestjs/swagger'
import { NotificationPublicationStatus } from '@prisma/client'
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'
import { PageQueryDto } from '@/common/dto/page.dto'

export class ListNotificationPublicationsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '关键字（匹配标题 / 内容）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string

  @ApiPropertyOptional({ enum: NotificationPublicationStatus, description: '按发布状态筛选' })
  @IsOptional()
  @IsEnum(NotificationPublicationStatus)
  status?: NotificationPublicationStatus
}
