import type { UserRole, UserStatus } from '@prisma/client'

/**
 * JWT 内部数据结构定义。
 *
 * sub 是 JWT 标准字段（subject），存 userId。
 * username 是为了让接口处理时不用再查库就能拿到用户名做日志/审计；
 * 不放 passwordHash 等敏感字段——token 是签名而非加密，明文可被任何持有者解析。
 *
 * 不放 role/status 是因为运营场景需要立即可控的封禁/降权——payload 内字段要等
 * access token 过期才生效，无法满足。鉴权由 AdminGuard 每次查 DB 判断。
 */
export interface JwtPayload {
  sub: string
  username: string
  iat?: number
  exp?: number
}

export interface AuthTokens {
  token: string
  refreshToken: string
}

export interface AuthUserPublic {
  id: string
  username: string
  nickname: string | null
  avatar: string | null
  role: UserRole
  status: UserStatus
  createdAt: Date
  updatedAt: Date
}

export interface LoginResponse extends AuthTokens {
  userInfo: AuthUserPublic
}
