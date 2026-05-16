import { registerAs } from '@nestjs/config'

/**
 * 对象存储（Cloudflare R2）配置。
 *
 * 开发环境可以不配（StorageService 会探测到并降级——业务接口正常运行，
 * 仅图片上传相关功能（导入脚本、菜谱管理后台）不可用）。
 * 生产环境必须全配齐，否则导入和管理后台会报错。
 *
 * R2 兼容 S3 协议，endpoint = https://<accountId>.r2.cloudflarestorage.com
 * publicUrl 是给浏览器/客户端访问图片的公开域名，开发用 R2.dev 子域名，
 * 生产建议绑自定义域名（cdn.xxx.com）。
 */
export const storageConfig = registerAs('storage', () => ({
  r2: {
    accountId: process.env.R2_ACCOUNT_ID ?? '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    bucketName: process.env.R2_BUCKET_NAME ?? '',
    publicUrl: process.env.R2_PUBLIC_URL ?? '',
  },
}))
