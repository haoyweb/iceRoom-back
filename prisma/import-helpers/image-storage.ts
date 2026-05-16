/**
 * 给批量脚本（migrate-recipe-images.ts、import-howtocook.ts）用的图片存储 helper。
 *
 * 为什么不复用 src/modules/storage/StorageService？
 * - StorageService 是 NestJS provider，依赖 ConfigService + IoC 容器；脚本里手动 new
 *   会绕开整套生命周期，反而更脆弱。两套实现保持轻度独立更清晰，env 变量是契约。
 * - 脚本和服务端互不引用，避免循环依赖问题。
 */

import { createHash } from 'node:crypto'
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

export interface R2Bridge {
  client: S3Client
  bucket: string
  publicUrl: string
}

/** 从 process.env 创建 R2 client；env 缺失时抛错，调用方先 check 再用。 */
export function createR2Bridge(): R2Bridge {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET_NAME
  const publicUrl = process.env.R2_PUBLIC_URL

  const missing = (['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'] as const)
    .filter((k) => !process.env[k])
  if (missing.length > 0 || !accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw new Error(`R2 凭证缺失: ${missing.join(', ')}。请配置 .env 后重试。`)
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
  return { client, bucket, publicUrl }
}

export interface DownloadAndUploadResult {
  success: boolean
  publicUrl: string | null
  error?: string
  bytes?: number
}

const RAW_GITHUB_PREFIX = 'https://raw.githubusercontent.com/'
const MEDIA_GITHUB_PREFIX = 'https://media.githubusercontent.com/media/'

/**
 * 把 raw.githubusercontent.com URL 转成 media.githubusercontent.com/media URL。
 *
 * 背景：HowToCook 仓库的图片用 Git LFS 存储。raw.githubusercontent.com 对 LFS 对象
 * 只返回 ~130 字节的指针文件（version/oid/size 三行 ASCII 元数据），不是真实图片。
 * 这会让"下载成功"成为陷阱——HTTP 200 + 一个非图片的小文本被上传到 R2，浏览器
 * 打开就是一段乱码。
 *
 * 真实二进制需要走 media.githubusercontent.com/media/<owner>/<repo>/<branch>/<path>，
 * 该端点对 LFS 和非 LFS 文件都能返回真实内容（GitHub 内部做了 fallback）。
 *
 * 数据库里的 imageSourceUrl 仍然存 raw URL 作为正式溯源；只有下载时换 host。
 */
function toGithubFetchUrl(url: string): string {
  if (!url.startsWith(RAW_GITHUB_PREFIX)) return url
  return MEDIA_GITHUB_PREFIX + url.slice(RAW_GITHUB_PREFIX.length)
}

/**
 * 下载 sourceUrl → 上传到 R2 destKey。
 * 单条失败不抛错，返回 success=false。批量场景下调用方据此决定 fallback。
 */
export async function downloadAndUpload(
  bridge: R2Bridge,
  sourceUrl: string,
  destKey: string,
): Promise<DownloadAndUploadResult> {
  try {
    const fetchUrl = toGithubFetchUrl(sourceUrl)
    const res = await fetch(fetchUrl)
    if (!res.ok) {
      return { success: false, publicUrl: null, error: `HTTP ${res.status}` }
    }
    const buffer = new Uint8Array(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') ?? guessContentType(destKey)

    // LFS 指针文件长度通常 < 300 字节，且 Content-Type 是 text/plain。
    // 这里做防御性校验：如果命中疑似指针的特征，明确报错而不是写入一份假图到 R2。
    if (buffer.byteLength < 300 && contentType.startsWith('text/')) {
      const head = new TextDecoder().decode(buffer.slice(0, 50))
      if (head.includes('git-lfs.github.com/spec/v1')) {
        return { success: false, publicUrl: null, error: `LFS pointer detected (size=${buffer.byteLength}). 可能 media URL 转换失效` }
      }
    }

    const normalizedKey = destKey.replace(/^\/+/, '')
    await bridge.client.send(new PutObjectCommand({
      Bucket: bridge.bucket,
      Key: normalizedKey,
      Body: buffer,
      ContentType: contentType,
    }))
    const publicUrl = `${bridge.publicUrl.replace(/\/+$/, '')}/${normalizedKey}`
    return { success: true, publicUrl, bytes: buffer.byteLength }
  } catch (error) {
    return { success: false, publicUrl: null, error: error instanceof Error ? error.message : String(error) }
  }
}

/** 从 R2 删除 key（用于回滚或菜谱删除时清理）。 */
export async function deleteR2Object(bridge: R2Bridge, key: string): Promise<void> {
  await bridge.client.send(new DeleteObjectCommand({
    Bucket: bridge.bucket,
    Key: key.replace(/^\/+/, ''),
  }))
}

/**
 * 推导菜谱图 R2 key。
 * 策略：recipes/<recipeId>/<sha256-12位>.<ext>
 * - 用 sourceUrl 的 hash 保证幂等（同一张图重新跑得同一个 key，不会上传两次）
 * - 用 recipeId 做命名空间，删菜谱时按前缀清理方便
 * - 全 ASCII，避免 HowToCook 图名含中文/空格在 URL 中的转义麻烦
 */
export function deriveRecipeImageKey(recipeId: string, sourceUrl: string): string {
  const ext = extractExtension(sourceUrl)
  const hash = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 12)
  return `recipes/${recipeId}/${hash}.${ext}`
}

/**
 * 推导步骤过程图 R2 key。
 * 策略：recipes/<recipeId>/steps/<stepIndex>/<sha256-12位>.<ext>
 *
 * 把步骤图与封面图分开放（steps/ 子目录）：
 *  - 便于按需清理（重新解析菜谱步骤时可以按前缀删旧的 steps/ 不影响封面）
 *  - 浏览 R2 bucket 时一眼能看出哪些是过程图
 *  - stepIndex 入路径而不只入 hash，方便手动核对"哪步的图"
 *
 * 仍然用 sourceUrl 的 hash 保证幂等：步骤图重传跑同一份 key，R2 覆盖写不重复。
 */
export function deriveStepImageKey(recipeId: string, stepIndex: string, sourceUrl: string): string {
  const ext = extractExtension(sourceUrl)
  const hash = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 12)
  return `recipes/${recipeId}/steps/${stepIndex}/${hash}.${ext}`
}

function extractExtension(url: string): string {
  const cleaned = url.split('?')[0] ?? url
  const segments = cleaned.split('.')
  const last = segments[segments.length - 1]?.toLowerCase()
  if (last && /^(jpg|jpeg|png|webp|gif)$/.test(last)) return last
  return 'jpg'
}

function guessContentType(key: string): string {
  const lower = key.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'application/octet-stream'
}
