import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle, seconds } from '@nestjs/throttler'
import { Public } from '@/common/decorators/public.decorator'
import { LoginDto } from './dto/login.dto'
import { RefreshDto } from './dto/refresh.dto'
import { RegisterDto } from './dto/register.dto'
import { AuthService } from './auth.service'

/**
 * 鉴权 4 端点。全部用 @Public 跳过全局 JwtAuthGuard——否则首次登录就被自己拦住。
 *
 * 注：MVP 不维护服务端 token 黑名单，logout 仅做客户端清理，所以也是 Public（避免过期
 * token 调不到 logout 反而卡住用户）。上线如果要做真退出（封禁未过期的 access token），
 * 需要 Redis 维护 jti 黑名单 + JwtAuthGuard 增加黑名单校验。
 *
 * TODO(security-before-prod):
 *   - 生产环境 BCRYPT_ROUNDS 调到 12+（生产硬件下约 300ms）
 *   - 上线前补单元/e2e 测试覆盖错误分支
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: seconds(60), blockDuration: seconds(300) } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '注册账号；成功后直接返回登录态' })
  @ApiOkResponse({ description: 'Register success.' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto)
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: seconds(60), blockDuration: seconds(300) } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用户名密码登录' })
  @ApiOkResponse({ description: 'Login success.' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto)
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用 refresh token 换发新 access/refresh 对' })
  @ApiOkResponse({ description: 'Refreshed tokens.' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken)
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'MVP 占位：服务端不维护黑名单，前端直接清本地 token 即可' })
  logout() {
    // 故意返回 null，让前端无论调用成功失败都走相同清理路径
    return null
  }
}
