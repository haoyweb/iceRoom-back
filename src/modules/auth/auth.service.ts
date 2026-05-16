import { HttpStatus, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Prisma, User } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { PrismaService } from '@/database/prisma.service'
import type { LoginDto } from './dto/login.dto'
import type { RegisterDto } from './dto/register.dto'
import type { AuthTokens, AuthUserPublic, JwtPayload, LoginResponse } from './auth.types'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 注册新用户：bcryptjs 哈希密码，落库；冲突走 Prisma P2002 → USER_EXISTS。
   * 注册成功后直接签发一对 token，省一次往返登录请求。
   */
  async register(dto: RegisterDto): Promise<LoginResponse> {
    const rounds = this.config.get<number>('auth.bcryptRounds') ?? 10
    const passwordHash = await bcrypt.hash(dto.password, rounds)

    let user: User
    try {
      user = await this.prisma.user.create({
        data: {
          username: dto.username,
          passwordHash,
          nickname: dto.nickname ?? null,
        },
      })
    }
    catch (err) {
      // Prisma 唯一约束冲突。比起手动先 findUnique 再 create 的两次查询，
      // 让数据库判定冲突更准确（并发场景下也不会漏）。
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BusinessException(ErrorCode.USER_EXISTS, '用户名已存在', HttpStatus.CONFLICT)
      }
      throw err
    }

    return this.buildLoginResponse(user)
  }

  /**
   * 登录：按用户名查用户，bcryptjs.compare 校验密码。
   * 不区分「用户不存在」和「密码错」对外的错误消息——避免被穷举枚举账号。
   */
  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } })
    if (!user) {
      throw new BusinessException(ErrorCode.INVALID_CREDENTIALS, '账号或密码错误', HttpStatus.UNAUTHORIZED)
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash)
    if (!ok) {
      throw new BusinessException(ErrorCode.INVALID_CREDENTIALS, '账号或密码错误', HttpStatus.UNAUTHORIZED)
    }

    return this.buildLoginResponse(user)
  }

  /**
   * Refresh：用独立的 refresh secret 校验，通过后重发一对新 token。
   * MVP 不做 rotation——同一 refresh token 7 天内可多次换 access，简化前端并发刷新逻辑。
   * 上线前如果要 rotation，需要在 user 上加 refreshTokenJti 字段做白名单。
   */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const refreshSecret = this.config.get<string>('auth.refreshSecret')
    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET is not configured.')
    }

    let payload: JwtPayload
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, { secret: refreshSecret })
    }
    catch {
      // verifyAsync 不区分过期/篡改，对前端而言都是「请重新登录」
      throw new BusinessException(ErrorCode.REFRESH_TOKEN_INVALID, 'Refresh token 无效或已过期', HttpStatus.UNAUTHORIZED)
    }

    // 兜底：refresh 内 user 必须真实存在（用户被删除后 token 还在的情况）
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) {
      throw new BusinessException(ErrorCode.REFRESH_TOKEN_INVALID, '用户不存在', HttpStatus.UNAUTHORIZED)
    }

    return this.signTokens(user)
  }

  private async buildLoginResponse(user: User): Promise<LoginResponse> {
    const tokens = await this.signTokens(user)
    return { ...tokens, userInfo: this.toPublic(user) }
  }

  private async signTokens(user: User): Promise<AuthTokens> {
    // 显式展开成 plain object，避免 @nestjs/jwt 的 signAsync overload 匹配到带 index signature
    // 的 jsonwebtoken.JwtPayload 时类型不兼容；运行时是同一个 JSON object。
    const payload = { sub: user.id, username: user.username }
    const accessSecret = this.config.get<string>('auth.accessSecret')
    const refreshSecret = this.config.get<string>('auth.refreshSecret')
    const accessTtl = this.config.get<string>('auth.accessTtl') ?? '15m'
    const refreshTtl = this.config.get<string>('auth.refreshTtl') ?? '7d'

    const [token, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, { secret: accessSecret, expiresIn: accessTtl as unknown as number }),
      this.jwtService.signAsync(payload, { secret: refreshSecret, expiresIn: refreshTtl as unknown as number }),
    ])

    return { token, refreshToken }
  }

  private toPublic(user: User): AuthUserPublic {
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }
  }
}
