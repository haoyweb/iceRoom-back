import { HttpStatus } from '@nestjs/common'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { UserService } from './user.service'

/**
 * B4 改造后 UserService 已不再提供 getById/list/create/remove 等通用方法，
 * 这里只验证 getMe 和 findByUsername 两个 me-centric 接口。
 */
describe('UserService', () => {
  it('getMe throws NOT_FOUND when user is missing', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    }
    const service = new UserService(prisma as never)

    await expect(service.getMe('missing')).rejects.toMatchObject({
      response: '用户不存在',
      status: HttpStatus.NOT_FOUND,
    })
    await expect(service.getMe('missing')).rejects.toBeInstanceOf(BusinessException)
    await expect(service.getMe('missing')).rejects.toHaveProperty('errorCode', ErrorCode.USER_NOT_FOUND)
  })

  it('getMe returns selected fields (no passwordHash)', async () => {
    const userRow = {
      id: 'user_1',
      username: 'alice',
      nickname: '爱丽丝',
      avatar: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(userRow) },
    }
    const service = new UserService(prisma as never)

    await expect(service.getMe('user_1')).resolves.toEqual(userRow)
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  })

  it('findByUsername returns user or null', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user_1', username: 'alice' }) },
    }
    const service = new UserService(prisma as never)

    await expect(service.findByUsername('alice')).resolves.toMatchObject({ id: 'user_1', username: 'alice' })
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { username: 'alice' } })
  })
})
