import Joi from 'joi'

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  CORS_ORIGIN: Joi.string().default('*'),
  SWAGGER_ENABLED: Joi.boolean().default(true),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),

  // JWT 鉴权。access/refresh 拆两套独立 secret——其中一边泄漏不会同时作废另一类令牌。
  // min(32) 是底线：16 字节熵 + base16/hex 编码 = 32 字符，足够防爆破；生产建议 48+ 字节。
  // 强制 required 不给 default，是为了"忘配置时 fail-fast 直接挂启动"，而不是默默用空字符串签出无效 token。
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  // TTL 走 zeit/ms 字符串（'15m'/'7d'），jsonwebtoken 原生识别；default 兜底保证 .env 没填也能跑。
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('7d'),
  BCRYPT_ROUNDS: Joi.number().integer().min(4).max(15).default(10),

  // Cloudflare R2 对象存储（可选；不配齐时 StorageService 自动降级）。
  // 校验策略：允许空串以兼容开发环境，非空时再校验格式。
  R2_ACCOUNT_ID: Joi.string().allow('').default(''),
  R2_ACCESS_KEY_ID: Joi.string().allow('').default(''),
  R2_SECRET_ACCESS_KEY: Joi.string().allow('').default(''),
  R2_BUCKET_NAME: Joi.string().allow('').default(''),
  R2_PUBLIC_URL: Joi.alternatives().try(
    Joi.string().uri({ scheme: ['https'] }),
    Joi.string().valid(''),
  ).default(''),
})

