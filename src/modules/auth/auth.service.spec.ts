import { HttpStatus } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { JwtService } from '@nestjs/jwt'
import { Prisma } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { AuthService } from './auth.service'

/**
 * 鉴权核心场景覆盖：
 *  - register 重复用户名 → USER_EXISTS
 *  - login 用户不存在/密码错 → INVALID_CREDENTIALS（统一消息）
 *  - refresh 错 token → REFRESH_TOKEN_INVALID
 *  - 成功路径：register/login 返回 token + userInfo + refreshToken
 *
 * bcryptjs.compare 在 mock 时 spy 替换返回值；不真的 hash 因为单测要快。
 */
function buildConfig(values: Record<string, unknown>): ConfigService {
  return { get: jest.fn((k: string) => values[k]) } as unknown as ConfigService
}

const CONFIG_VALUES = {
  'auth.accessSecret': 'a'.repeat(32),
  'auth.refreshSecret': 'b'.repeat(32),
  'auth.accessTtl': '15m',
  'auth.refreshTtl': '7d',
  'auth.bcryptRounds': 4, // 测试环境用最小值加速
}

const settings = { isRegistrationEnabled: jest.fn().mockResolvedValue(true) }

function createService(prisma: unknown, jwt: JwtService) {
  return new AuthService(prisma as never, jwt, buildConfig(CONFIG_VALUES), settings as never)
}

describe('AuthService', () => {
  it('register conflict throws USER_EXISTS', async () => {
    // Prisma P2002 唯一约束冲突。模拟 user.create 抛 PrismaClientKnownRequestError({code:'P2002'})
    const prismaError = new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' })
    const prisma = {
      user: { create: jest.fn().mockRejectedValue(prismaError) },
    }
    const jwt = { signAsync: jest.fn() } as unknown as JwtService
    const service = createService(prisma, jwt)

    await expect(service.register({ username: 'alice', password: 'password' })).rejects.toBeInstanceOf(BusinessException)
    await expect(service.register({ username: 'alice', password: 'password' })).rejects.toMatchObject({
      response: '用户名已存在',
      status: HttpStatus.CONFLICT,
    })
  })

  it('login wrong password throws INVALID_CREDENTIALS', async () => {
    const passwordHash = await bcrypt.hash('correct-pwd', 4)
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', username: 'alice', passwordHash }) },
    }
    const jwt = { signAsync: jest.fn() } as unknown as JwtService
    const service = createService(prisma, jwt)

    await expect(service.login({ username: 'alice', password: 'wrong-pwd' })).rejects.toMatchObject({
      response: '账号或密码错误',
      status: HttpStatus.UNAUTHORIZED,
    })
    await expect(service.login({ username: 'alice', password: 'wrong-pwd' })).rejects.toHaveProperty('errorCode', ErrorCode.INVALID_CREDENTIALS)
  })

  it('login unknown user returns same INVALID_CREDENTIALS message (no enumeration)', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    }
    const jwt = { signAsync: jest.fn() } as unknown as JwtService
    const service = createService(prisma, jwt)

    await expect(service.login({ username: 'ghost', password: 'anything' })).rejects.toMatchObject({
      response: '账号或密码错误',
    })
  })

  it('register success returns userInfo + tokens', async () => {
    const userRow = {
      id: 'u1', username: 'alice', passwordHash: 'hash', nickname: null, avatar: null,
      createdAt: new Date(), updatedAt: new Date(),
    }
    const prisma = {
      user: { create: jest.fn().mockResolvedValue(userRow) },
    }
    const jwt = {
      signAsync: jest.fn().mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token'),
    } as unknown as JwtService
    const service = createService(prisma, jwt)

    const result = await service.register({ username: 'alice', password: 'password' })

    expect(result.token).toBe('access-token')
    expect(result.refreshToken).toBe('refresh-token')
    expect(result.userInfo).toMatchObject({ id: 'u1', username: 'alice' })
    // 关键：返回的 userInfo 不应该带 passwordHash
    expect((result.userInfo as unknown as Record<string, unknown>).passwordHash).toBeUndefined()
  })

  it('refresh with invalid token throws REFRESH_TOKEN_INVALID', async () => {
    const prisma = {}
    const jwt = {
      verifyAsync: jest.fn().mockRejectedValue(new Error('jwt malformed')),
    } as unknown as JwtService
    const service = createService(prisma, jwt)

    await expect(service.refresh('bad-token')).rejects.toMatchObject({
      response: 'Refresh token 无效或已过期',
      status: HttpStatus.UNAUTHORIZED,
    })
    await expect(service.refresh('bad-token')).rejects.toHaveProperty('errorCode', ErrorCode.REFRESH_TOKEN_INVALID)
  })

  it('refresh with valid token but missing user rejects', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    }
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', username: 'alice' }),
    } as unknown as JwtService
    const service = createService(prisma, jwt)

    await expect(service.refresh('valid-but-stale')).rejects.toMatchObject({
      response: '用户不存在',
      status: HttpStatus.UNAUTHORIZED,
    })
  })

  it('refresh success returns new pair', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', username: 'alice' }) },
    }
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', username: 'alice' }),
      signAsync: jest.fn().mockResolvedValueOnce('new-access').mockResolvedValueOnce('new-refresh'),
    } as unknown as JwtService
    const service = createService(prisma, jwt)

    await expect(service.refresh('old-refresh')).resolves.toEqual({
      token: 'new-access',
      refreshToken: 'new-refresh',
    })
  })
})
