import { HttpStatus, Injectable } from '@nestjs/common'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { PrismaService } from '@/database/prisma.service'
import type { CreateUserDto } from './dto/create-user.dto'
import type { UpdateUserDto } from './dto/update-user.dto'

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    })
  }

  create(data: CreateUserDto) {
    return this.prisma.user.create({ data })
  }

  async getById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { fridges: true },
    })

    if (!user) {
      throw new BusinessException(ErrorCode.USER_NOT_FOUND, '用户不存在', HttpStatus.NOT_FOUND)
    }

    return user
  }

  async update(id: string, data: UpdateUserDto) {
    await this.ensureExists(id)

    return this.prisma.user.update({
      where: { id },
      data,
    })
  }

  async remove(id: string) {
    await this.ensureExists(id)

    return this.prisma.user.delete({
      where: { id },
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
