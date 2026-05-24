import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { SettingsModule } from '../settings/settings.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './strategies/jwt.strategy'

/**
 * AuthModule 组装。
 *
 * JwtModule.registerAsync 注入 access secret/ttl，refresh 在 AuthService 里独立用
 * jwtService.signAsync({ secret, expiresIn }) 显式覆盖——
 * 两个 secret 不混在 module 级别配置，避免误用。
 *
 * 这里没引入 UserModule——AuthService 直接拿 PrismaService 读写 User，
 * UserService 现在只剩 internal 协助方法（getMe/findByUsername），按需在 B4 再决定是否导入。
 */
@Module({
  imports: [
    PassportModule,
    SettingsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.get<string>('auth.accessSecret'),
        // expiresIn 在 @nestjs/jwt 类型中是 ms.StringValue（字面量 union），运行时接受任意 ms 字符串。
        // 这里 as 一下避开类型噪音——值的真实校验由 Joi schema 在启动时做了。
        signOptions: { expiresIn: (config.get<string>('auth.accessTtl') ?? '15m') as unknown as number },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}

