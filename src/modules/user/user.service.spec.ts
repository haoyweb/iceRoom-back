import { HttpStatus } from '@nestjs/common'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { UserService } from './user.service'

describe('UserService', () => {
  it('throws when user does not exist', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    }
    const service = new UserService(prisma as never)

    await expect(service.getById('missing')).rejects.toMatchObject({
      response: '用户不存在',
      status: HttpStatus.NOT_FOUND,
    })
    await expect(service.getById('missing')).rejects.toBeInstanceOf(BusinessException)
    await expect(service.getById('missing')).rejects.toHaveProperty('errorCode', ErrorCode.USER_NOT_FOUND)
  })
})
