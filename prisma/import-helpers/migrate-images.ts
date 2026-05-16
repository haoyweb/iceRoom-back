/**
 * 把数据库中所有 imageUrl 仍是 raw.githubusercontent.com 的菜谱图迁移到 R2。
 *
 * 设计点：
 * - 幂等：成功后 imageUrl 已变成 R2 URL，下次跑不再处理（where 条件过滤）。
 * - 失败不阻塞：单条失败不抛错，imageUrl 置 null（前端 fallback 到占位），
 *   imageSourceUrl 永远保留原 URL，后续可补救/重试。
 * - 限并发：默认 4，避免 raw.githubusercontent.com 限流。如果失败率高，调低到 1-2。
 * - 步骤图（stepImages JSON）顺带迁：对每个 raw URL 单独上传到 R2，原地替换为 R2 URL，
 *   失败的步骤图从 JSON 中丢弃（不影响主图，前端按"无图"渲染）。
 *
 * 供两处调用：
 *   - prisma/migrate-recipe-images.ts（CLI 入口，一次性迁移现有数据）
 *   - prisma/import-howtocook.ts（导入后顺便迁移新数据）
 */

import { Prisma, type PrismaClient } from '@prisma/client'
import type { R2Bridge } from './image-storage'
import { deriveRecipeImageKey, deriveStepImageKey, downloadAndUpload } from './image-storage'

export interface MigrationReport {
  total: number
  /** 主图迁移成功条数 */
  success: number
  /** 主图迁移失败条数 */
  failed: number
  /** 步骤图上传成功的张数（按图计，不按菜谱） */
  stepImagesUploaded: number
  /** 步骤图上传失败的张数 */
  stepImagesFailed: number
  /** 所有图（主图 + 步骤图）累计字节数 */
  totalBytes: number
  failures: { name: string; sourceUrl: string; error: string }[]
}

export interface MigrationOptions {
  prisma: PrismaClient
  bridge: R2Bridge
  /** 并发度。默认 4。失败率高可调到 1-2 串行；机器快网络好可调到 8。 */
  concurrency?: number
  /** 限制处理条数，调试用。 */
  limit?: number
  /** 进度回调，每条完成调用一次。 */
  onProgress?: (done: number, total: number, last: { success: boolean; name: string }) => void
  /**
   * 强制重新同步：处理所有 imageSourceUrl 是 raw URL 的菜谱（即使 imageUrl 已是 R2 URL）。
   * 用于修复"上传了错的数据"的场景，比如 LFS 指针文件混入。R2 key 不变，新内容覆盖旧对象。
   */
  forceResync?: boolean
}

const RAW_URL_PREFIX = 'https://raw.githubusercontent.com'

/**
 * 判断主图是否需要迁移。一个独立函数便于 worker 内复用 + 行为可读。
 *
 *   - imageUrl 还是 raw URL          → 需要（首次迁移）
 *   - imageUrl null + imageSourceUrl 是 raw → 需要（上次失败重试）
 *   - forceResync + imageSourceUrl 是 raw  → 需要（强制重传，覆盖 R2 旧内容）
 *   - 其他                             → 不需要
 */
function shouldMigrateMainImage(
  item: { imageUrl: string | null; imageSourceUrl: string | null },
  forceResync: boolean,
): { migrate: boolean; sourceUrl: string | null } {
  if (item.imageUrl?.startsWith(RAW_URL_PREFIX)) {
    return { migrate: true, sourceUrl: item.imageUrl }
  }
  if (item.imageSourceUrl?.startsWith(RAW_URL_PREFIX)) {
    if (forceResync || item.imageUrl === null) {
      return { migrate: true, sourceUrl: item.imageSourceUrl }
    }
  }
  return { migrate: false, sourceUrl: null }
}

export async function migrateRawImagesToR2(options: MigrationOptions): Promise<MigrationReport> {
  const { prisma, bridge, concurrency = 4, limit, onProgress, forceResync = false } = options

  // 待处理范围：把"主图可能要迁的"和"步骤图可能要迁的"取并集。
  //   主图：raw URL / 失败重试 / forceResync
  //   步骤图：stepImages 字段非 NULL（细粒度的 raw URL 检查放到 worker 里做，因为 Prisma 不直接支持
  //     JSON-text contains 查询；JSON 字段查 NULL 用 Prisma.JsonNull 显式区别于 DbNull）
  const mainWhereCandidates = forceResync
    ? [{ imageSourceUrl: { startsWith: RAW_URL_PREFIX } }]
    : [
        { imageUrl: { startsWith: RAW_URL_PREFIX } },
        {
          AND: [
            { imageUrl: null },
            { imageSourceUrl: { startsWith: RAW_URL_PREFIX } },
          ],
        },
      ]
  const pendingWhere = {
    OR: [
      ...mainWhereCandidates,
      { stepImages: { not: Prisma.JsonNull } },
    ],
  }

  const pending = await prisma.recipeSuggestionRule.findMany({
    where: pendingWhere,
    select: {
      id: true,
      name: true,
      imageUrl: true,
      imageSourceUrl: true,
      stepImages: true,
    },
    ...(limit ? { take: limit } : {}),
  })

  const report: MigrationReport = {
    total: pending.length,
    success: 0,
    failed: 0,
    stepImagesUploaded: 0,
    stepImagesFailed: 0,
    totalBytes: 0,
    failures: [],
  }

  if (pending.length === 0) return report

  const queue = [...pending]
  let done = 0

  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const item = queue.shift()
      if (!item) return

      // ── 主图 ────────────────────────────────────────────
      const updateData: Prisma.RecipeSuggestionRuleUpdateInput = {}
      const mainCheck = shouldMigrateMainImage(item, forceResync)
      let mainSuccess = true // 不需要迁移 → 默认算成功（不计 success/failed，但 onProgress 该报 success）

      if (mainCheck.migrate && mainCheck.sourceUrl) {
        const key = deriveRecipeImageKey(item.id, mainCheck.sourceUrl)
        const result = await downloadAndUpload(bridge, mainCheck.sourceUrl, key)
        if (result.success && result.publicUrl) {
          updateData.imageUrl = result.publicUrl
          updateData.imageSourceUrl = mainCheck.sourceUrl
          report.success += 1
          report.totalBytes += result.bytes ?? 0
        } else {
          updateData.imageUrl = null
          updateData.imageSourceUrl = mainCheck.sourceUrl
          report.failed += 1
          report.failures.push({
            name: item.name,
            sourceUrl: mainCheck.sourceUrl,
            error: result.error ?? 'unknown',
          })
          mainSuccess = false
        }
      }

      // ── 步骤图 ──────────────────────────────────────────
      // stepImages 字段是 Json?，Prisma 返回 Prisma.JsonValue | null
      // 期望结构：{ "<stepIndex>": ["url1", "url2"], ... }；类型不符就跳过（防御性，避免脏数据炸进程）
      const rawStepImages = item.stepImages
      if (rawStepImages !== null && typeof rawStepImages === 'object' && !Array.isArray(rawStepImages)) {
        const stepMap = rawStepImages as Record<string, unknown>
        const newStepImages: Record<string, string[]> = {}
        let stepImagesChanged = false

        for (const [stepIdx, urlsRaw] of Object.entries(stepMap)) {
          if (!Array.isArray(urlsRaw)) continue
          const newUrls: string[] = []
          for (const url of urlsRaw) {
            if (typeof url !== 'string') continue
            // 已经是 R2 URL → 原样保留，除非 forceResync（强制重传时只处理 raw URL，R2 URL 无源头可拉取，跳过）
            if (!url.startsWith(RAW_URL_PREFIX)) {
              newUrls.push(url)
              continue
            }
            const key = deriveStepImageKey(item.id, stepIdx, url)
            const result = await downloadAndUpload(bridge, url, key)
            if (result.success && result.publicUrl) {
              newUrls.push(result.publicUrl)
              report.stepImagesUploaded += 1
              report.totalBytes += result.bytes ?? 0
              stepImagesChanged = true
            } else {
              // 失败丢弃这张步骤图——前端按该步骤"无图"渲染，不影响整体流程
              report.stepImagesFailed += 1
              report.failures.push({
                name: `${item.name} [步骤 ${stepIdx} 图]`,
                sourceUrl: url,
                error: result.error ?? 'unknown',
              })
              stepImagesChanged = true
            }
          }
          if (newUrls.length > 0) newStepImages[stepIdx] = newUrls
        }

        if (stepImagesChanged) {
          updateData.stepImages =
            Object.keys(newStepImages).length > 0 ? newStepImages : Prisma.JsonNull
        }
      }

      // ── 一次性写回 ──────────────────────────────────────
      if (Object.keys(updateData).length > 0) {
        await prisma.recipeSuggestionRule.update({
          where: { id: item.id },
          data: updateData,
        })
      }

      done += 1
      onProgress?.(done, pending.length, { success: mainSuccess, name: item.name })
    }
  })

  await Promise.all(workers)
  return report
}
