import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common'
import { UserRole, UserStatus } from '@prisma/client'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { PrismaService } from '@/database/prisma.service'
import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator'

/**
 * 管理员守卫。
 *
 * 链路：全局 JwtAuthGuard 已挂上 request.user（包含 id/username），AdminGuard 负责：
 *   1. 拿 id 查 DB，确认账号未被封禁（status == active）
 *   2. 确认角色属于 admin / super_admin
 *
 * 每次请求都查一次 DB，不做缓存——这是有意的：
 *   - 运营场景 QPS 低，单字段 select 成本可忽略
 *   - 缓存会让 ban / 降权延迟生效，违反「立即可控」的运营预期
 *
 * Controller 类级 `@UseGuards(AdminGuard)` 即可，敏感操作再叠加 `@Roles(...)` + RolesGuard 做细粒度过滤。
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>()
    const userRef = request.user
    if (!userRef?.id) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '未登录', HttpStatus.UNAUTHORIZED)
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userRef.id },
      select: { role: true, status: true },
    })

    if (!user) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '账号不存在或已被删除', HttpStatus.UNAUTHORIZED)
    }

    if (user.status === UserStatus.banned) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '账号已被封禁', HttpStatus.FORBIDDEN)
    }

    if (user.role !== UserRole.admin && user.role !== UserRole.super_admin) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '没有运营后台访问权限', HttpStatus.FORBIDDEN)
    }

    return true
  }
}
