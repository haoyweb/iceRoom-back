/**
 * JWT 内部数据结构定义。
 *
 * sub 是 JWT 标准字段（subject），存 userId。
 * username 是为了让接口处理时不用再查库就能拿到用户名做日志/审计；
 * 不放 passwordHash 等敏感字段——token 是签名而非加密，明文可被任何持有者解析。
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
  createdAt: Date
  updatedAt: Date
}

export interface LoginResponse extends AuthTokens {
  userInfo: AuthUserPublic
}
