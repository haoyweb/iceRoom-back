import type { ExecutionContext } from '@nestjs/common'
import { createParamDecorator } from '@nestjs/common'

/**
 * 从 JWT 解析后挂在 req.user 上的当前用户中提取信息。
 *
 * 用法：
 *   @Get()
 *   list(@CurrentUser('id') userId: string) { ... }
 *   @Get('me')
 *   me(@CurrentUser() user: AuthenticatedUser) { ... }
 *
 * 不带参数返回整个 user 对象；带 'id' / 'username' 返回对应字段。
 * 类型在 JwtStrategy.validate 返回值处确定（{ id, username }），保持单一来源。
 */
export interface AuthenticatedUser {
  id: string
  username: string
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>()
    const user = request.user
    if (!user) {
      // 走到这意味着 guard 没拦住——可能是漏写了 @Public 又没挂全局 guard，
      // 或者 strategy 验证逻辑漏掉了 throw。抛错比静默返回 undefined 更早暴露问题。
      throw new Error('CurrentUser used without auth context — check guard registration.')
    }
    return data ? user[data] : user
  },
)
