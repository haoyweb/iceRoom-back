import { ApiPropertyOptional } from '@nestjs/swagger'
import { NotificationType } from '@prisma/client'
import { IsEnum, IsOptional } from 'class-validator'

export class MarkAllNotificationsReadDto {
  @ApiPropertyOptional({ enum: NotificationType, example: NotificationType.food_expiring })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType
}
