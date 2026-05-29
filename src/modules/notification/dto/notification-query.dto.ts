import { ApiPropertyOptional } from '@nestjs/swagger'
import { NotificationStatus, NotificationType } from '@prisma/client'
import { IsEnum, IsOptional } from 'class-validator'
import { PageQueryDto } from '@/common/dto/page.dto'

export class NotificationQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: NotificationStatus, example: NotificationStatus.unread })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus

  @ApiPropertyOptional({ enum: NotificationType, example: NotificationType.food_expiring })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType
}
