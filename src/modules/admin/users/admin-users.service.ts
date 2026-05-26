import { HttpStatus, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma, UserRole, UserStatus } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { createPageResult } from '@/common/dto/page.dto'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { PrismaService } from '@/database/prisma.service'
import type { BanUserDto } from './dto/ban-user.dto'
import type { ListUsersQueryDto } from './dto/list-users.query.dto'
import type { ResetPasswordDto } from './dto/reset-password.dto'
import type { UpdateUserRoleDto } from './dto/update-user-role.dto'
import type { UpdateVisionDailyLimitDto } from './dto/update-vision-daily-limit.dto'

/**
 * 运营后台用户管理服务。
 *
 * 权限约束（service 层强制，前端只是辅助 UX）：
 *   - 任何人不能操作自己（避免自封禁 / 自己改自己密码绕过）
 *   - admin 不能操作 super_admin（防止普通管理员误降权 super_admin）
 *   - super_admin 之间互相不能 ban / reset-password（兜底位互锁）
 *
 * 这一层校验在 service 内部 `assertCanOperate` 集中做——controller 只负责接参，
 * 避免在多个端点重复粘贴权限判断。
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list(query: ListUsersQueryDto) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword?.trim()
        ? {
            OR: [
              { username: { contains: query.keyword.trim(), mode: 'insensitive' } },
              { nickname: { contains: query.keyword.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          username: true,
          nickname: true,
          avatar: true,
          role: true,
          status: true,
          bannedAt: true,
          banReason: true,
          createdAt: true,
          updatedAt: true,
          visionDailyLimit: true,
          _count: {
            select: { fridges: true, visionRecognitionJobs: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ])

    const list = users.map(u => ({
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      avatar: u.avatar,
      role: u.role,
      status: u.status,
      bannedAt: u.bannedAt,
      banReason: u.banReason,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      visionDailyLimit: u.visionDailyLimit,
      fridgeCount: u._count.fridges,
      visionJobCount: u._count.visionRecognitionJobs,
    }))

    return createPageResult(list, total, page, pageSize)
  }

  async getById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true,
        role: true,
        status: true,
        bannedAt: true,
        banReason: true,
        visionDailyLimit: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { fridges: true, visionRecognitionJobs: true },
        },
      },
    })

    if (!user) {
      throw new BusinessException(ErrorCode.USER_NOT_FOUND, '用户不存在', HttpStatus.NOT_FOUND)
    }

    // 食材数从 FoodItem 表统计——比 _count select 通过 fridge 关联清晰
    const foodCount = await this.prisma.foodItem.count({
      where: { fridge: { userId: id } },
    })

    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      role: user.role,
      status: user.status,
      bannedAt: user.bannedAt,
      banReason: user.banReason,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      visionDailyLimit: user.visionDailyLimit,
      fridgeCount: user._count.fridges,
      visionJobCount: user._count.visionRecognitionJobs,
      foodCount,
    }
  }

  async ban(id: string, dto: BanUserDto, operatorId: string) {
    const target = await this.assertCanOperate(id, operatorId)
    if (target.status === UserStatus.banned) {
      throw new BusinessException(ErrorCode.CONFLICT, '该用户已被封禁', HttpStatus.CONFLICT)
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.banned,
        bannedAt: new Date(),
        banReason: dto.reason ?? null,
      },
      select: { id: true, status: true, bannedAt: true, banReason: true },
    })
    return updated
  }

  async unban(id: string, operatorId: string) {
    const target = await this.assertCanOperate(id, operatorId)
    if (target.status === UserStatus.active) {
      throw new BusinessException(ErrorCode.CONFLICT, '该用户未被封禁', HttpStatus.CONFLICT)
    }

    const updated = await this.prisma.user.update({
      where: { id },
      // 解封时保留 bannedAt / banReason 供审计——只把 status 改回 active
      data: { status: UserStatus.active },
      select: { id: true, status: true, bannedAt: true, banReason: true },
    })
    return updated
  }

  async resetPassword(id: string, dto: ResetPasswordDto, operatorId: string) {
    await this.assertCanOperate(id, operatorId)
    const rounds = this.config.get<number>('auth.bcryptRounds') ?? 10
    const passwordHash = await bcrypt.hash(dto.newPassword, rounds)
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    })
    return { id, success: true as const }
  }

  async updateVisionDailyLimit(id: string, dto: UpdateVisionDailyLimitDto, operatorId: string) {
    await this.assertCanOperate(id, operatorId)
    const updated = await this.prisma.user.update({
      where: { id },
      data: { visionDailyLimit: dto.visionDailyLimit },
      select: { id: true, visionDailyLimit: true },
    })
    return updated
  }

  async updateRole(id: string, dto: UpdateUserRoleDto, operatorId: string) {
    const target = await this.assertCanUpdateRole(id, operatorId, dto.role)
    if (target.role === dto.role) {
      return { id: target.id, role: target.role }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role: dto.role },
      select: { id: true, role: true },
    })
    return updated
  }

  private async assertCanUpdateRole(targetId: string, operatorId: string, nextRole: UserRole) {
    if (targetId === operatorId) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '不能修改自己的角色', HttpStatus.FORBIDDEN)
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true, status: true },
    })

    if (!target) {
      throw new BusinessException(ErrorCode.USER_NOT_FOUND, '用户不存在', HttpStatus.NOT_FOUND)
    }
    if (target.role === UserRole.super_admin) {
      throw new BusinessException(ErrorCode.FORBIDDEN, 'super_admin 角色不能在后台修改', HttpStatus.FORBIDDEN)
    }
    if (target.status === UserStatus.banned && nextRole !== UserRole.user) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '已封禁用户不能提权，请先解封', HttpStatus.FORBIDDEN)
    }

    return target
  }

  /**
   * 集中校验「当前操作人能不能动这个 target」。
   *
   * 返回 target 信息，避免上层再查一次。
   * - 不能操作自己（任何角色）
   * - admin 不能动 super_admin
   * - super_admin 不能动 super_admin（兜底位互锁）
   */
  private async assertCanOperate(targetId: string, operatorId: string) {
    if (targetId === operatorId) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '不能对自己执行该操作', HttpStatus.FORBIDDEN)
    }

    const [target, operator] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, role: true, status: true },
      }),
      this.prisma.user.findUnique({
        where: { id: operatorId },
        select: { role: true },
      }),
    ])

    if (!target) {
      throw new BusinessException(ErrorCode.USER_NOT_FOUND, '用户不存在', HttpStatus.NOT_FOUND)
    }
    if (!operator) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '操作人账号异常', HttpStatus.UNAUTHORIZED)
    }

    if (target.role === UserRole.super_admin) {
      throw new BusinessException(ErrorCode.FORBIDDEN, 'super_admin 不能被运营后台操作', HttpStatus.FORBIDDEN)
    }
    if (target.role === UserRole.admin && operator.role !== UserRole.super_admin) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '操作 admin 需要 super_admin 权限', HttpStatus.FORBIDDEN)
    }

    return target
  }
}
