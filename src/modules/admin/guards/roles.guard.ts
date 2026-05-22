import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { UserRole } from '@prisma/client'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { PrismaService } from '@/database/prisma.service'
import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator'
import { ROLES_KEY } from '../decorators/roles.decorator'

/**
 * 角色守卫——与 @Roles(...) 装饰器配合做细粒度过滤。
 *
 * 必须在 AdminGuard 之后挂（顺序由 @UseGuards 决定），因为它假定调用方已经是 admin/super_admin。
 * 没标 @Roles 的端点直接放行；标了 @Roles 时只允许列表内的角色。
 *
 * 这里也走一次 DB 查询——和 AdminGuard 看起来重复，但好处是：
 *   - AdminGuard 可单独使用（多数 controller 不需要细粒度）
 *   - RolesGuard 只在需要时挂，重复 1 次 DB select 的成本可接受
 *   - 不引入 request-scoped cache 这种「看起来省但调试难」的优化
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!required || required.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>()
    const userRef = request.user
    if (!userRef?.id) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '未登录', HttpStatus.UNAUTHORIZED)
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userRef.id },
      select: { role: true },
    })

    if (!user || !required.includes(user.role)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '该操作需要更高权限', HttpStatus.FORBIDDEN)
    }

    return true
  }
}
