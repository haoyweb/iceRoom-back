import { registerAs } from '@nestjs/config'

/**
 * 鉴权相关配置。
 *
 * access/refresh 拆成两套独立 secret 的理由：单边泄漏不会同时作废两类令牌，
 * 且让 refresh 的密钥能放在更高安全级别的存储里（生产环境可以一份在 K8s secret、
 * 另一份在 vault，运维操作互相隔离）。
 *
 * TTL 用 zeit/ms 字符串（'15m'/'7d'）原样传给 jsonwebtoken，避免在配置层做 ms 转换
 * 拿不到清晰的语义；上层 (auth.service) 直接消费字符串即可。
 *
 * bcryptRounds 决定密码哈希成本：10 ≈ 100ms（dev/MVP 够用），生产建议 12+（约 300ms）。
 * 改这个值不影响已存的旧密码——bcrypt 会把 rounds 写进 hash 头，比对时自动按旧值跑。
 */
export const authConfig = registerAs('auth', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
  accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),
}))
