import { ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator'

/**
 * 全局 JWT 守卫。
 *
 * canActivate 在调 super 之前先看 handler/class 是否有 @Public()——
 * 这是「全局守卫 + 公开接口」组合的标准实现。
 *
 * 不放到 strategy 里做 public 跳过是因为：strategy 是「如何解析 token」，
 * 「这条接口要不要 token」是路由元数据的职责，分离边界更清晰。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super()
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (isPublic) {
      return true
    }

    return super.canActivate(context)
  }
}
