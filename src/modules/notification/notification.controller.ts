import { Controller, Get, Param, Patch, Query } from '@nestjs/common'
import { ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { MarkAllNotificationsReadDto } from './dto/mark-all-notifications-read.dto'
import { NotificationQueryDto } from './dto/notification-query.dto'
import { NotificationService } from './notification.service'

@ApiTags('notification')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOkResponse({ description: 'List notifications for current user.' })
  list(@Query() query: NotificationQueryDto, @CurrentUser('id') userId: string) {
    return this.notificationService.list(query, userId)
  }

  @Get('unread-count')
  @ApiOkResponse({ description: 'Get unread notification count for current user.' })
  getUnreadCount(@CurrentUser('id') userId: string) {
    return this.notificationService.getUnreadCount(userId)
  }

  @Patch('read-all')
  @ApiOkResponse({ description: 'Mark all notifications as read for current user.' })
  markAllRead(@Query() query: MarkAllNotificationsReadDto, @CurrentUser('id') userId: string) {
    return this.notificationService.markAllRead(query, userId)
  }

  @Patch(':id/read')
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiOkResponse({ description: 'Mark a notification as read for current user.' })
  markRead(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.notificationService.markRead(id, userId)
  }
}
