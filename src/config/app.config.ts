import { registerAs } from '@nestjs/config'

/**
 * CORS 白名单解析：
 *   - 单个 `*` 表示放开（开发/小工具场景，main.ts 会转成 origin: true）
 *   - 否则按逗号拆分多个 origin，trim 后过滤空值，作为精确白名单
 *
 * 生产环境务必显式列举所有合法 origin（C 端 + 运营后台），
 * 避免「为了图省事写 `*` 然后忘了改」导致跨域裸奔。
 */
function parseCorsOrigin(raw: string | undefined): string[] {
  const value = (raw ?? '*').trim()
  if (!value) {
    return ['*']
  }
  return value.split(',').map(s => s.trim()).filter(Boolean)
}

export const appConfig = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
}))
