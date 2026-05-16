import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

/**
 * Cloudflare R2 对象存储封装。
 *
 * 设计：
 * - 构造时探测 env 是否齐全。不齐全则降级为「未就绪」状态，所有写操作抛错，
 *   读操作（getPublicUrl）仍可用——业务接口不受影响，方便开发环境跑通。
 * - 暴露 isReady() 给上层（导入脚本、管理后台）决定是否使用。
 * - upload 返回完整公开 URL，调用方直接写入数据库即可。
 *
 * 后续扩展点：
 * - 加签名 URL（私有 bucket + 临时访问令牌），用于上传后端不想暴露的资源
 * - 加 CDN 缓存清除（R2 自带 CDN，但自定义域名场景下要 purge）
 * - 加内容哈希作为 key，去重相同图片（HowToCook 没这种重复，但用户上传可能有）
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name)
  private readonly client: S3Client | null
  private readonly bucket: string
  private readonly publicUrl: string

  constructor(private readonly config: ConfigService) {
    const accountId = config.get<string>('storage.r2.accountId') ?? ''
    const accessKeyId = config.get<string>('storage.r2.accessKeyId') ?? ''
    const secretAccessKey = config.get<string>('storage.r2.secretAccessKey') ?? ''
    this.bucket = config.get<string>('storage.r2.bucketName') ?? ''
    this.publicUrl = config.get<string>('storage.r2.publicUrl') ?? ''

    const allSet = accountId && accessKeyId && secretAccessKey && this.bucket && this.publicUrl
    if (!allSet) {
      this.client = null
      this.logger.warn('R2 storage 配置不完整，对象存储功能已降级（写操作将抛错）。请检查 .env 中 R2_* 字段。')
      return
    }

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    })
    this.logger.log(`R2 storage 已就绪 (bucket=${this.bucket})`)
  }

  isReady(): boolean {
    return this.client !== null
  }

  /**
   * 上传二进制数据到指定 key，返回该 key 的公开访问 URL。
   * @throws 未配置 R2 或上传失败时抛错。
   */
  async upload(key: string, body: Uint8Array, contentType: string): Promise<string> {
    if (!this.client) {
      throw new Error('R2 storage 未配置完整，无法上传')
    }
    const normalizedKey = key.replace(/^\/+/, '')
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: normalizedKey,
      Body: body,
      ContentType: contentType,
    }))
    return this.buildPublicUrl(normalizedKey)
  }

  async delete(key: string): Promise<void> {
    if (!this.client) {
      throw new Error('R2 storage 未配置完整，无法删除')
    }
    const normalizedKey = key.replace(/^\/+/, '')
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: normalizedKey,
    }))
  }

  /** 拼接公开访问 URL。即使未配置也返回字符串（空），调用方自行判空。 */
  getPublicUrl(key: string): string {
    if (!this.publicUrl) return ''
    return this.buildPublicUrl(key.replace(/^\/+/, ''))
  }

  private buildPublicUrl(key: string): string {
    return `${this.publicUrl.replace(/\/+$/, '')}/${key}`
  }
}
