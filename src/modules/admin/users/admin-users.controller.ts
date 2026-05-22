import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { AdminGuard } from '../guards/admin.guard'
import { RolesGuard } from '../guards/roles.guard'
import { AdminUsersService } from './admin-users.service'
import { BanUserDto } from './dto/ban-user.dto'
import { ListUsersQueryDto } from './dto/list-users.query.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'

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
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: '重置用户密码' })
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser('id') operatorId: string,
  ) {
    return this.service.resetPassword(id, dto, operatorId)
  }
}
