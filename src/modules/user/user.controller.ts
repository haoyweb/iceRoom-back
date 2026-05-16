import { Body, Controller, Get, Patch } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { UpdateUserDto } from './dto/update-user.dto'
import { UserService } from './user.service'

/**
 * 鉴权改造后只保留 me 接口集。
 *
 * 历史接口（list/create/getById/update/remove）已删除：
 *  - 注册走 POST /auth/register
 *  - 用户管理（后台运营）以后再加专门的 admin controller + @Roles
 *
 * 这是「能力收敛」原则——controller 只暴露真实业务需要的能力，
 * 不预留「以备万一」的开放接口，减少攻击面。
 */
@ApiTags('user')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @ApiOkResponse({ description: 'Get current user profile.' })
  getMe(@CurrentUser('id') userId: string) {
    return this.userService.getMe(userId)
  }

  @Patch('me')
  @ApiOkResponse({ description: 'Update current user profile (nickname / avatar).' })
  updateMe(@Body() data: UpdateUserDto, @CurrentUser('id') userId: string) {
    return this.userService.updateMe(userId, data)
  }
}
