/**
 * 菜谱入库后的数据质量审计脚本。
 *
 * 接入新菜谱源（HowToCook / 下厨房 / 小红书等）后，建议跑一遍本脚本看：
 * 1. 随机抽 30 条样本，目测 name / requiredIngredients / reasonTemplate 是否合理
 * 2. 全库食材频次 TOP 30，肉眼检查高频项有没有"密封袋"这类工具漏网
 * 3. 长度边缘项（>= 10 字符的食材）通常是没归一好的脏数据，列出方便回补词典
 *
 * 用法：pnpm ts-node prisma/audit-recipes.ts
 * 可选：--popularity 50  仅审计指定 popularityScore 的批次（默认全量）
 */

import { argv } from 'node:process'
import { PrismaClient } from '@prisma/client'

interface CliOptions {
  sampleSize: number
  topN: number
  popularity?: number
}

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = { sampleSize: 30, topN: 30 }
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--sample') opts.sampleSize = Number(args[i + 1] ?? opts.sampleSize)
    else if (arg === '--top') opts.topN = Number(args[i + 1] ?? opts.topN)
    else if (arg === '--popularity') opts.popularity = Number(args[i + 1])
  }
  return opts
}

async function main() {
  const opts = parseArgs(argv.slice(2))
  const prisma = new PrismaClient()

  try {
    console.log(`\n=== Recipe Audit ===\n`)
    if (opts.popularity !== undefined) {
      console.log(`筛选条件：popularityScore = ${opts.popularity}\n`)
    }

    const where = opts.popularity !== undefined ? { popularityScore: opts.popularity } : undefined
    const total = await prisma.recipeSuggestionRule.count({ where })
    console.log(`总数：${total}\n`)

    if (total === 0) {
      console.log('无数据可审计。')
      return
    }

    // ── 1. 随机抽样 ──────────────────────────────────────
    // Postgres 的 ORDER BY RANDOM() 在小表上够用；大表请改 TABLESAMPLE。
    const sampleSize = Math.min(opts.sampleSize, total)
    const samples = opts.popularity !== undefined
      ? await prisma.$queryRaw<{
          name: string
          requiredIngredients: string[]
          reasonTemplate: string
          difficulty: string
          estimatedMinutes: number
        }[]>`
          SELECT name, "requiredIngredients", "reasonTemplate", difficulty, "estimatedMinutes"
          FROM "RecipeSuggestionRule"
          WHERE "popularityScore" = ${opts.popularity}
          ORDER BY RANDOM()
          LIMIT ${sampleSize}
        `
      : await prisma.$queryRaw<{
          name: string
          requiredIngredients: string[]
          reasonTemplate: string
          difficulty: string
          estimatedMinutes: number
        }[]>`
          SELECT name, "requiredIngredients", "reasonTemplate", difficulty, "estimatedMinutes"
          FROM "RecipeSuggestionRule"
          ORDER BY RANDOM()
          LIMIT ${sampleSize}
        `

    console.log(`── 随机抽样 ${samples.length} 条 ──`)
    for (const r of samples) {
      const ings = r.requiredIngredients.join(', ')
      console.log(`  · ${r.name} [${r.difficulty}, ${r.estimatedMinutes}min]`)
      console.log(`      食材: ${ings}`)
      console.log(`      理由: ${r.reasonTemplate.slice(0, 60)}`)
    }

    // ── 2. 食材频次 TOP N ────────────────────────────────
    const rows = await prisma.recipeSuggestionRule.findMany({
      where,
      select: { requiredIngredients: true },
    })
    const freq = new Map<string, number>()
    for (const row of rows) {
      for (const ing of row.requiredIngredients) {
        freq.set(ing, (freq.get(ing) ?? 0) + 1)
      }
    }
    const sortedFreq = [...freq.entries()].sort((a, b) => b[1] - a[1])

    console.log(`\n── 食材频次 TOP ${opts.topN}（共 ${freq.size} 种食材） ──`)
    for (const [ing, count] of sortedFreq.slice(0, opts.topN)) {
      console.log(`  ${ing.padEnd(16)} ${count}`)
    }

    // ── 3. 长度边缘 / 可能脏数据 ────────────────────────
    const suspicious = [...freq.keys()].filter((s) => s.length >= 8).sort()
    console.log(`\n── 长度 ≥ 8 的食材（${suspicious.length} 种，可能需要归一） ──`)
    for (const s of suspicious) {
      console.log(`  ${s.padEnd(16)} 出现 ${freq.get(s)} 次`)
    }

    // ── 4. 只在 1 条菜谱里出现的食材（低频边角） ─────────
    const singletons = [...freq.entries()].filter(([, c]) => c === 1).map(([s]) => s).sort()
    console.log(`\n── 仅出现 1 次的食材（${singletons.length} 种，前 40 个） ──`)
    for (const s of singletons.slice(0, 40)) {
      console.log(`  ${s}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
