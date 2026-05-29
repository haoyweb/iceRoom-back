import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Roles } from '../decorators/roles.decorator'
import { AdminGuard } from '../guards/admin.guard'
import { RolesGuard } from '../guards/roles.guard'
import { AdminNotificationsService } from './admin-notifications.service'
import { ListNotificationPublicationsQueryDto } from './dto/list-notification-publications.query.dto'
import { PublishSystemNotificationDto } from './dto/publish-system-notification.dto'

@ApiTags('admin-notifications')
@UseGuards(AdminGuard, RolesGuard)
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(private readonly service: AdminNotificationsService) {}

  @Get()
  @ApiOkResponse({ description: '系统通知发布记录列表' })
  list(@Query() query: ListNotificationPublicationsQueryDto) {
    return this.service.list(query)
  }

  @Post('system')
  @Roles(UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: '发布系统通知给所有 active 用户' })
  publishSystem(@Body() dto: PublishSystemNotificationDto, @CurrentUser('id') operatorId: string) {
    return this.service.publishSystem(dto, operatorId)
  }
}
