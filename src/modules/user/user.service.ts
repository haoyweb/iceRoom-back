import { HttpStatus, Injectable } from '@nestjs/common'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { PrismaService } from '@/database/prisma.service'
import type { UpdateUserDto } from './dto/update-user.dto'

/**
 * 鉴权改造后用户表 service 责任收敛：
 *  - findByUsername：登录路径会用到（AuthService 自己直接读 prisma 也行，但保留 helper 方便复用）
 *  - getMe：「我的」页面渲染用户信息
 *  - updateMe：「我的」页面修改昵称/头像
 *
 * 已删除的方法（B4 改造）：
 *  - list/create/update/remove（被替换为 auth 流程，参考 AuthService）
 *  - getById（如未来管理后台需要，需配合 @Roles 装饰器再加回）
 */
@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } })
  }

  async getMe(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      // 不返回 passwordHash，避免误把哈希明文回前端
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!user) {
      throw new BusinessException(ErrorCode.USER_NOT_FOUND, '用户不存在', HttpStatus.NOT_FOUND)
    }

    return user
  }

  async updateMe(id: string, data: UpdateUserDto) {
    await this.ensureExists(id)

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  }

  async ensureExists(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!user) {
      throw new BusinessException(ErrorCode.USER_NOT_FOUND, '用户不存在', HttpStatus.NOT_FOUND)
    }
  }
}
