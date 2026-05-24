import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { Roles } from '../decorators/roles.decorator'
import { AdminGuard } from '../guards/admin.guard'
import { RolesGuard } from '../guards/roles.guard'
import { AdminSettingsService } from './admin-settings.service'
import { UpdateRegistrationSettingDto } from './dto/update-registration-setting.dto'

@ApiTags('admin-settings')
@UseGuards(AdminGuard, RolesGuard)
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly service: AdminSettingsService) {}

  @Get()
  @ApiOkResponse({ description: '运营后台全局设置' })
  getSettings() {
    return this.service.getSettings()
  }

  @Patch('registration')
  @Roles(UserRole.super_admin)
  @ApiOkResponse({ description: '更新 C 端注册开关' })
  updateRegistration(@Body() dto: UpdateRegistrationSettingDto) {
    return this.service.updateRegistration(dto.enabled)
  }
}
