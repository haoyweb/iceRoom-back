import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Roles } from '../decorators/roles.decorator'
import { AdminGuard } from '../guards/admin.guard'
import { RolesGuard } from '../guards/roles.guard'
import { AdminUsersService } from './admin-users.service'
import { BanUserDto } from './dto/ban-user.dto'
import { ListUsersQueryDto } from './dto/list-users.query.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'
import { UpdateUserRoleDto } from './dto/update-user-role.dto'
import { UpdateVisionDailyLimitDto } from './dto/update-vision-daily-limit.dto'

@ApiTags('admin-users')
@UseGuards(AdminGuard, RolesGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly service: AdminUsersService) {}

  @Get()
  @ApiOkResponse({ description: '用户列表（分页 + 关键字/角色/状态筛选）' })
  list(@Query() query: ListUsersQueryDto) {
    return this.service.list(query)
  }

  @Get(':id')
  @ApiOkResponse({ description: '用户详情' })
  getById(@Param('id') id: string) {
    return this.service.getById(id)
  }

  @Post(':id/ban')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: '封禁用户' })
  ban(@Param('id') id: string, @Body() dto: BanUserDto, @CurrentUser('id') operatorId: string) {
    return this.service.ban(id, dto, operatorId)
  }

  @Post(':id/unban')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: '解封用户' })
  unban(@Param('id') id: string, @CurrentUser('id') operatorId: string) {
    return this.service.unban(id, operatorId)
  }

  @Post(':id/reset-password')
  @Roles(UserRole.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: '重置用户密码' })
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser('id') operatorId: string,
  ) {
    return this.service.resetPassword(id, dto, operatorId)
  }

  @Patch(':id/vision-daily-limit')
  @Roles(UserRole.super_admin)
  @ApiOkResponse({ description: '设置用户每日拍照识别额度' })
  updateVisionDailyLimit(
    @Param('id') id: string,
    @Body() dto: UpdateVisionDailyLimitDto,
    @CurrentUser('id') operatorId: string,
  ) {
    return this.service.updateVisionDailyLimit(id, dto, operatorId)
  }

  @Patch(':id/role')
  @Roles(UserRole.super_admin)
  @ApiOkResponse({ description: '修改用户角色' })
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser('id') operatorId: string,
  ) {
    return this.service.updateRole(id, dto, operatorId)
  }
}
