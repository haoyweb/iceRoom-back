import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator'
import type { JwtPayload } from '../auth.types'

/**
 * JWT 解析策略。
 *
 * - 从 Authorization: Bearer <token> 提取
 * - secretOrKey 走 access secret（refresh secret 由 AuthService 自己用 jwtService.verifyAsync 校验）
 * - validate 返回值会被 Passport 挂到 request.user 上，供 @CurrentUser 装饰器消费
 *
 * 不在这里查库换全量 user 对象——sub/username 已经足够大部分接口决策，
 * 需要更多字段（avatar/nickname）的接口走 service 单独 fetch。
 * 这样能让大多数受保护接口零开销通过 JWT。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly config: ConfigService) {
    const secret = config.get<string>('auth.accessSecret')
    if (!secret) {
      // Joi 已经在 startup 校验过，这里二次防御，避免后续 sign/verify 用空 secret 静默失败
      throw new Error('JWT_ACCESS_SECRET is not configured.')
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // ignoreExpiration:false 是默认值，写出来让阅读者一眼看明白——过期 token 会被 Passport 自动拒
      ignoreExpiration: false,
      secretOrKey: secret,
    })
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return { id: payload.sub, username: payload.username }
  }
}
