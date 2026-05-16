/**
 * 一次性迁移脚本：把数据库中所有 imageUrl 仍是 raw.githubusercontent.com 的菜谱图
 * 搬到 Cloudflare R2，imageSourceUrl 保留原 URL 做溯源。
 *
 * 用法：
 *   pnpm ts-node prisma/migrate-recipe-images.ts                            # dry-run（不写 R2，只统计）
 *   pnpm ts-node prisma/migrate-recipe-images.ts --confirm                  # 真迁移
 *   pnpm ts-node prisma/migrate-recipe-images.ts --confirm --force-resync   # 强制重新同步所有 raw 来源的菜谱（覆盖 R2 旧内容）
 *   pnpm ts-node prisma/migrate-recipe-images.ts --confirm --limit 20       # 仅处理前 20 张（调试）
 *   pnpm ts-node prisma/migrate-recipe-images.ts --confirm --concurrency 2  # 限速避免 GitHub 限流
 *
 * 前置条件：
 *   1. .env 中 R2_* 5 个字段全部配齐
 *   2. 已跑过 prisma migrate dev --name add_recipe_image_source_url（加 imageSourceUrl 字段）
 */

import 'dotenv/config'
import { argv, exit } from 'node:process'
import { PrismaClient } from '@prisma/client'
import { createR2Bridge } from './import-helpers/image-storage'
import { migrateRawImagesToR2 } from './import-helpers/migrate-images'

interface CliOptions {
  confirm: boolean
  limit?: number
  concurrency: number
  forceResync: boolean
}

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = { confirm: false, concurrency: 4, forceResync: false }
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--confirm') opts.confirm = true
    else if (arg === '--force-resync') opts.forceResync = true
    else if (arg === '--limit') opts.limit = Number(args[i + 1])
    else if (arg === '--concurrency') opts.concurrency = Number(args[i + 1])
  }
  return opts
}

const RAW_URL_PREFIX = 'https://raw.githubusercontent.com'

async function main() {
  const opts = parseArgs(argv.slice(2))
  console.log(`\n=== Recipe Image Migration ${opts.confirm ? '(CONFIRM)' : '(DRY RUN)'}${opts.forceResync ? ' [FORCE-RESYNC]' : ''} ===\n`)

  const prisma = new PrismaClient()
  try {
    // 待迁移 where：force-resync 时处理所有 imageSourceUrl 是 raw 的（不管 imageUrl 当前是什么）；
    // 否则只处理 imageUrl 是 raw 或 null+imageSourceUrl 是 raw 的（首次 + 失败重试）。
    const pendingWhere = opts.forceResync
      ? { imageSourceUrl: { startsWith: RAW_URL_PREFIX } }
      : {
          OR: [
            { imageUrl: { startsWith: RAW_URL_PREFIX } },
            {
              AND: [
                { imageUrl: null },
                { imageSourceUrl: { startsWith: RAW_URL_PREFIX } },
              ],
            },
          ],
        }
    const totalPending = await prisma.recipeSuggestionRule.count({ where: pendingWhere })
    console.log(`待迁移：${totalPending} 张图${opts.limit ? `（本次 limit=${opts.limit}）` : ''}`)
    console.log(`并发度：${opts.concurrency}`)

    if (totalPending === 0) {
      console.log('\n所有图都已经在 R2 上（或没有图），没有需要迁移的，结束。')
      return
    }

    const samples = await prisma.recipeSuggestionRule.findMany({
      where: pendingWhere,
      select: { name: true, imageUrl: true, imageSourceUrl: true },
      take: 5,
    })
    console.log(`\n样本（前 5 条）：`)
    for (const s of samples) {
      const src = s.imageSourceUrl ?? s.imageUrl ?? '(无)'
      const tag = opts.forceResync ? '[强制]' : (s.imageUrl === null ? '[重试]' : '[首次]')
      console.log(`  ${tag} ${s.name} → ${src.slice(0, 80)}...`)
    }

    if (!opts.confirm) {
      console.log(`\nDry run 结束。加 --confirm 真正迁移到 R2。`)
      return
    }

    const bridge = createR2Bridge()
    console.log(`\nR2 ready → bucket=${bridge.bucket}, publicUrl=${bridge.publicUrl}\n`)
    console.log(`开始迁移...\n`)

    const startedAt = Date.now()
    const report = await migrateRawImagesToR2({
      prisma,
      bridge,
      concurrency: opts.concurrency,
      limit: opts.limit,
      forceResync: opts.forceResync,
      onProgress: (done, total, last) => {
        if (done % 10 === 0 || done === total || !last.success) {
          const flag = last.success ? '✓' : '✗'
          console.log(`  [${done.toString().padStart(3)}/${total}] ${flag} ${last.name.slice(0, 30)}`)
        }
      },
    })
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)

    console.log(`\n迁移完成（耗时 ${elapsed}s）：`)
    console.log(`  ✓ 主图成功 ${report.success}  (累计 ${(report.totalBytes / 1024 / 1024).toFixed(2)} MB)`)
    console.log(`  ✗ 主图失败 ${report.failed}`)
    if (report.stepImagesUploaded > 0 || report.stepImagesFailed > 0) {
      console.log(`  · 步骤图：✓ ${report.stepImagesUploaded}  ✗ ${report.stepImagesFailed}`)
    }

    if (report.failures.length > 0) {
      console.log(`\n失败清单（前 20 条；失败菜谱 imageUrl 已置 null，前端会走 placeholder）：`)
      for (const f of report.failures.slice(0, 20)) {
        console.log(`  - ${f.name}: ${f.error}`)
        console.log(`      ${f.sourceUrl}`)
      }
      if (report.failures.length > 20) {
        console.log(`  ...还有 ${report.failures.length - 20} 条（imageSourceUrl 已保留，后续可重试）`)
      }
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error('\n[migrate] 致命错误:', error)
  exit(1)
})
