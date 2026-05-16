/**
 * HowToCook 菜谱批量导入脚本。
 *
 * 数据源：https://github.com/Anduin2017/HowToCook（Unlicense / 公共领域）
 * 默认从本地缓存目录 .cache/howtocook-data/ 读取（先 `git clone --depth 1` 一次即可）。
 *
 * 用法：
 *   pnpm ts-node prisma/import-howtocook.ts                                       # dry-run，只打印统计与样本
 *   pnpm ts-node prisma/import-howtocook.ts --confirm                              # 真入库（createMany + skipDuplicates）
 *   pnpm ts-node prisma/import-howtocook.ts --confirm --reset                      # 先删 source=howtocook 的旧批次再重插
 *   pnpm ts-node prisma/import-howtocook.ts --confirm --migrate-images             # 入库后顺便把图迁移到 R2
 *   pnpm ts-node prisma/import-howtocook.ts --source <dir>                         # 指定数据源目录
 *   pnpm ts-node prisma/import-howtocook.ts --limit 50                             # 只处理前 N 条
 *
 * 解析策略：HowToCook 每篇菜谱遵循 6 段式 markdown 模板，提取
 *   - 标题（去掉"的做法"后缀）
 *   - "预估烹饪难度" 行的 ★ 数量 → easy/medium/hard
 *   - "## 必备原料和工具" 下的 bullet 列表 → 食材（已减去工具黑名单 + 归一同义词）
 *   - 操作步骤数 → estimatedMinutes 估算
 */

import 'dotenv/config'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import { argv, exit } from 'node:process'
import { Prisma, PrismaClient, RecipeDifficulty } from '@prisma/client'
import {
  INGREDIENT_ANY_SUBSECTION,
  INGREDIENT_TAIL_NOISE,
  INGREDIENT_TOOL_SUBSECTION,
  SYNONYMS,
  TOOL_BLACKLIST,
} from './import-helpers/recipe-dictionaries'
import { createR2Bridge } from './import-helpers/image-storage'
import { migrateRawImagesToR2 } from './import-helpers/migrate-images'

const STAR_TO_DIFFICULTY = (stars: number): RecipeDifficulty => {
  if (stars <= 1) return RecipeDifficulty.easy
  if (stars <= 3) return RecipeDifficulty.medium
  return RecipeDifficulty.hard
}

const STEPS_TO_MINUTES = (steps: number): number => {
  if (steps <= 3) return 10
  if (steps <= 6) return 20
  if (steps <= 10) return 35
  return 50
}

/**
 * 分类基础分。值域留在 [25, 65]，配合难度偏移最终落在 [15, 75]，
 * 与 seed.ts 的种子（70/80/100）刻意错开，确保手工种子优先级始终高于批量导入。
 */
const CATEGORY_BASE_SCORE: Record<string, number> = {
  breakfast: 65,
  staple: 60,
  vegetable_dish: 60,
  meat_dish: 55,
  soup: 55,
  aquatic: 45,
  dessert: 40,
  drink: 35,
  'semi-finished': 30,
  condiment: 25,
  template: 5,
}

/** 难度对热度的修正：易做菜谱推荐时加权，难菜降权。 */
const DIFFICULTY_OFFSET: Record<RecipeDifficulty, number> = {
  easy: 10,
  medium: 0,
  hard: -10,
}

function calculatePopularity(category: string, difficulty: RecipeDifficulty): number {
  const base = CATEGORY_BASE_SCORE[category] ?? 40
  const offset = DIFFICULTY_OFFSET[difficulty]
  return Math.max(5, Math.min(95, base + offset))
}

/** 数据来源标识。新增菜谱源时（小红书/下厨房等）请用其各自的源 ID，便于 --reset 按源粒度清理。 */
const SOURCE_ID = 'howtocook'

// ────────────────────────────────────────────────────────────────────────────
// 解析器
// ────────────────────────────────────────────────────────────────────────────

interface ParsedRecipe {
  name: string
  difficulty: RecipeDifficulty
  estimatedMinutes: number
  ingredients: string[]
  rawIngredients: string[]
  stepsCount: number
  reasonHint: string
  category: string
  filePath: string
  warnings: string[]
  instructions: string[]
  tips: string | null
  imageUrl: string | null
  sourceRefUrl: string
  /** "## 计算" 章节解析结果；null 表示原文没有计算章节。 */
  portions: { description: string; items: Array<{ name: string; amount: string }> } | null
  /**
   * 步骤过程图。key 是 instructions 数组的下标（字符串化），value 是图的 raw URL 数组。
   * 空对象表示原文步骤间没有插图。
   */
  stepImages: Record<string, string[]>
}

const HOWTOCOOK_RAW_BASE = 'https://raw.githubusercontent.com/Anduin2017/HowToCook/master/'
const HOWTOCOOK_BLOB_BASE = 'https://github.com/Anduin2017/HowToCook/blob/master/'

/**
 * 把 markdown 里 `![](xxx)` 的相对路径解析成 HowToCook GitHub raw 直链。
 * 已是完整 URL 时原样返回。
 *
 * 抽出来给 extractImageUrl / extractStepImages 复用，避免两份"./ 剥前缀 + 拼 raw base"逻辑分叉。
 */
function resolveImageUrl(imgPath: string, relPath: string): string {
  if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) return imgPath
  let p = imgPath
  if (p.startsWith('./')) p = p.slice(2)
  if (p.startsWith('/')) p = p.slice(1)
  const dir = relPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
  const fullPath = dir ? `${dir}/${p}` : p
  return HOWTOCOOK_RAW_BASE + fullPath
}

/**
 * 从 markdown 行数组中抽取 "## 操作" 章节下的所有步骤。
 *
 * 处理细节：
 * - 一个步骤可能跨多行（续行 + 缩进 bullet 子项），都拼到当前步骤里
 * - 部分菜谱用 "### 步骤名" 分组，每组下重新计数 1./2./3.（如「炸薯条」「巴斯克芝士蛋糕」）
 *   策略：把子标题作为前缀，拼到下一步开头，避免步骤丢上下文
 * - 步骤里的 markdown 内链 [文字](./xxx.md) 会被剥成纯文字
 * - `![alt](./xxx.jpg)` 步骤间嵌入的过程图行**整行跳过**，不污染步骤文本；
 *   这些图由 extractStepImages 单独归类。
 */
function extractInstructions(lines: string[]): string[] {
  const operationStart = lines.findIndex((l) => /^##\s*操作/.test(l))
  if (operationStart < 0) return []
  let operationEnd = lines.findIndex((l, i) => i > operationStart && /^##\s/.test(l))
  if (operationEnd < 0) operationEnd = lines.length

  const instructions: string[] = []
  let current: string | null = null
  let subheading: string | null = null

  const commit = () => {
    if (current === null) return
    let text = current.trim().replace(/\s+/g, ' ')
    // 去 markdown 内链 [文字](url) → 文字
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    if (text) instructions.push(text)
    current = null
  }

  for (let i = operationStart + 1; i < operationEnd; i += 1) {
    const line = lines[i]
    if (!line) {
      if (current !== null) current += '' // 空行不打断当前步骤，但保留缓冲
      continue
    }
    if (/^###?\s+/.test(line)) {
      commit()
      subheading = line.replace(/^#+\s+/, '').trim() || null
      continue
    }
    // 整行只含图片引用 → 跳过，由 extractStepImages 处理；否则会被错误地拼到上一步
    if (/^\s*!\[[^\]]*\]\([^)]+\)\s*$/.test(line)) continue
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/)
    if (numbered) {
      commit()
      const head = subheading ? `${subheading}：` : ''
      current = head + (numbered[1] ?? '')
      subheading = null
      continue
    }
    if (current === null) continue
    const trimmed = line.trim()
    if (!trimmed) continue
    current += ' ' + trimmed.replace(/^[-*+]\s*/, '')
  }
  commit()
  return instructions
}

/**
 * 扫描 "## 操作" 章节内嵌的图片，按"扁平步骤序号"归类。
 *
 * 为什么 key 用扁平序号（0-based 字符串）而不是原文 "1./2./3."：
 *   HowToCook 有些菜谱用 "### 子步骤名" 分组，每组重新计数 1./2./3.（炸薯条、巴斯克芝士蛋糕）。
 *   extractInstructions 输出的是**扁平数组**（多个组拼成一个长数组），所以这里也用同样的扁平计数器，
 *   保证 stepImages[idx] 跟 instructions[idx] 严格对齐，前端可以直接 `instructions[i] + stepImages[String(i)]`。
 *
 * heroUrl：封面图 URL（来自 extractImageUrl）。如果某步骤的图正好是封面图，跳过（避免重复展示）。
 *
 * 返回值结构：{ "3": ["https://...焯水.jpg"], "9": ["https://...细丝.jpg"] }
 * 步骤无图 → 该 key 不出现（前端按"无图"渲染）；返回空对象表示整篇都没图。
 */
function extractStepImages(
  lines: string[],
  relPath: string,
  heroUrl: string | null,
): Record<string, string[]> {
  const operationStart = lines.findIndex((l) => /^##\s*操作/.test(l))
  if (operationStart < 0) return {}
  let operationEnd = lines.findIndex((l, i) => i > operationStart && /^##\s/.test(l))
  if (operationEnd < 0) operationEnd = lines.length

  const result: Record<string, string[]> = {}
  let flatIdx = -1 // 还没遇到任何 \d+. 步骤前，图片不归类（避免把章节头部插图当作"第 -1 步图"）

  for (let i = operationStart + 1; i < operationEnd; i += 1) {
    const line = lines[i]
    if (!line) continue
    // 子标题不影响 flatIdx 计数（保持与 extractInstructions 的扁平化策略一致）
    if (/^###?\s+/.test(line)) continue
    if (/^\s*\d+\.\s+/.test(line)) {
      flatIdx += 1
      continue
    }
    // 在当前行中找所有图片（一行可能多张）
    const matches = [...line.matchAll(/!\[[^\]]*\]\(([^)]+\.(?:jpg|jpeg|png|webp))\)/gi)]
    if (matches.length === 0) continue
    if (flatIdx < 0) continue
    const stepKey = String(flatIdx)
    for (const m of matches) {
      const imgPath = m[1]
      if (!imgPath) continue
      const url = resolveImageUrl(imgPath, relPath)
      if (heroUrl && url === heroUrl) continue
      if (!result[stepKey]) result[stepKey] = []
      // 单步重复同一张图也去掉
      if (!result[stepKey].includes(url)) result[stepKey].push(url)
    }
  }
  return result
}

/**
 * 解析 "## 计算" 章节，提取定量配比。
 *
 * HowToCook 这个章节有三种主要写法（采样观察）：
 *   1. 「按照 1 盘的份量：」 + bullet 列表（可乐鸡翅）
 *   2. 「每份：」 + bullet 列表（凉拌鸡丝）
 *   3. 「总量（按每份）：」 + 一段说明文字 + bullet 列表（奶油蘑菇汤）
 *   也有少数把份量信息直接放标题（**主菜**）+ 再下一行 bullet。
 *
 * 策略：
 *   - description：章节内**第一个**非 bullet、非粗体子标题的文本行，去掉结尾冒号
 *   - items：所有 bullet 项，按"第一个空格"拆 name/amount；无空格则全部当 name
 *
 * 没有 bullet 项时返回 null —— 前端隐藏整张计算卡片，比展示空列表更友好。
 */
function extractPortions(lines: string[]): {
  description: string
  items: Array<{ name: string; amount: string }>
} | null {
  const start = lines.findIndex((l) => /^##\s*计算/.test(l))
  if (start < 0) return null
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l))
  if (end < 0) end = lines.length

  let description = ''
  const items: Array<{ name: string; amount: string }> = []

  for (let i = start + 1; i < end; i += 1) {
    const raw = lines[i]
    if (!raw) continue
    const trimmed = raw.trim()
    if (!trimmed) continue
    if (/^###?\s+/.test(trimmed)) continue // 跳过子标题（**主菜** 之类已用 markdown 加粗，不是 ###）

    // bullet 项
    const bulletMatch = trimmed.match(/^[*\-+]\s+(.*)$/)
    if (bulletMatch) {
      const item = parsePortionItem(bulletMatch[1] ?? '')
      if (item) items.push(item)
      continue
    }

    // 非 bullet 文本：第一行作为 description（剥粗体/链接/尾部冒号）
    if (!description) {
      let d = trimmed
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[`*]/g, '')
        .trim()
      d = d.replace(/[:：]\s*$/, '').trim()
      if (d) description = d.slice(0, 60)
    }
  }

  if (items.length === 0) return null
  return { description, items }
}

/**
 * 拆 bullet 文本为 { name, amount }。
 * 策略：按第一个空格切分；HowToCook 大部分 bullet 都是「名字 数量+单位」格式（如「白糖 10 克」「可乐 500ml」）。
 * 无空格时全部归 name（如「半个西瓜」「少许盐」），amount 留空。
 *
 * 不刻意识别量词——前端把 amount 原样展示，保留 HowToCook 原文的「10 ～ 12 只」「1 个 (450g)」这类灵活写法。
 */
function parsePortionItem(text: string): { name: string; amount: string } | null {
  let s = text.trim()
  if (!s) return null
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  // HowToCook 大量菜谱用 "* 份数" 表示"每份量 × 份数"的计算公式，不是物理量；展示前剥掉
  // 注意：要在剥 markdown 加粗的 `*` 之前先剥这个，否则 "* 份数" 会先变成 " 份数" 残留下来
  s = s.replace(/\s*\*\s*份数\s*$/, '').trim()
  s = s.replace(/[`*]/g, '').trim()
  if (!s) return null

  const m = s.match(/^(\S+)\s+(.+)$/)
  if (!m) return { name: s, amount: '' }
  const head = (m[1] ?? '').trim()
  // 如果第一个空格之前的"name"含中英文逗号（如「黑鳕鱼，带皮，2 片，450g（本菜谱主角...）」），
  // 说明这条 item 用逗号做主分隔、空格只是细节里的分隔符——按 first-space 切会把 name 切歪。
  // 这种情况整段都当 name 展示更准确，前端 amount 列会显示 "—" 占位。
  if (/[，,]/.test(head)) {
    return { name: s, amount: '' }
  }
  // 部分菜谱用 "原料 = 数量" 格式（小龙虾），剥掉 amount 开头的 '=' 让展示更干净
  const amount = (m[2] ?? '').trim().replace(/^=\s*/, '')
  return { name: head, amount }
}

/** 抽取 "## 附加内容" 章节下可读的 bullet 文本，拼成多行字符串。截到 500 字符。 */
function extractTips(lines: string[]): string | null {
  const extraStart = lines.findIndex((l) => /^##\s*附加内容/.test(l))
  if (extraStart < 0) return null
  const bullets: string[] = []
  for (let i = extraStart + 1; i < lines.length; i += 1) {
    const trimmed = lines[i]?.trim()
    if (!trimmed) continue
    if (/^##\s/.test(trimmed)) break
    // HowToCook 仓库统一的尾部声明
    if (/^如果您遵循本指南/.test(trimmed)) break
    const m = trimmed.match(/^[*\-+]\s+(.*)$/)
    if (!m) continue
    const text = (m[1] ?? '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()
    if (!text) continue
    if (/^https?:\/\//.test(text)) continue
    if (/^!\[/.test(text)) continue
    bullets.push(text)
  }
  if (bullets.length === 0) return null
  return bullets.join('\n').slice(0, 500)
}

/** 找 markdown 里的第一张图，转成 HowToCook GitHub raw 直链；作为封面图。 */
function extractImageUrl(lines: string[], relPath: string): string | null {
  for (const line of lines) {
    const m = line.match(/!\[[^\]]*\]\(([^)]+\.(?:jpg|jpeg|png|webp))\)/i)
    if (!m || !m[1]) continue
    return resolveImageUrl(m[1], relPath)
  }
  return null
}

const deriveSourceRefUrl = (relPath: string): string =>
  HOWTOCOOK_BLOB_BASE + relPath.replace(/\\/g, '/')

// 量词集合：用于去除"数字+量词"前后缀。集中定义便于将来增减（如新增"袋装"、"盒装"等）。
const QUANTITY_UNIT = '克|g|kg|ml|毫升|升|斤|两|个|只|片|块|根|颗|瓣|条|包|盒|袋|份|大勺|小勺|茶匙|汤匙|杯|碗|cm|mm|厘米|毫米|寸|段|节|把|捧|撮|束'
// 前缀量词允许中文数字（一/二/.../十/百/千/两/半），让"一个鸡蛋"、"半个西瓜"也能被剥离
const LEADING_QUANTITY = new RegExp(`^[一二三四五六七八九十百千两半\\d]+(\\.\\d+)?\\s*(${QUANTITY_UNIT})\\s*`)
// 尾部只剥阿拉伯数字 + 量词；尾部不剥中文数字以保护"五花肉"等以中文数字开头的食材名
const TRAILING_QUANTITY = new RegExp(`\\s*\\d+(\\.\\d+)?\\s*(${QUANTITY_UNIT}).*$`)

// 已知子段落/章节前缀白名单：用于剥除 bullet 内的"标签：内容"格式。
// 必须用白名单，否则会误伤"奶油奶酪：212g"这类"食材名：数量"写法。
const KNOWN_LABEL_PREFIX = /^(原料|食材|主料|配料|辅料|调味料|调料|腌料|工具|器具|厨具|可选|必备|建议|其他调味料|其它调味料|菜类材料|面食材料)\s*[:：]\s*/

function normalizeIngredient(raw: string): string | null {
  let s = raw.trim()
  // 去 markdown 列表前缀
  s = s.replace(/^[*\-+]\s+/, '').trim()
  // 去 markdown 图片引用 ![alt](url) 残留
  s = s.replace(/!\[[^\]]*\][^\s]*/g, '').trim()
  // 去 backtick / 加粗 / 下划线
  s = s.replace(/[`*_]/g, '').trim()
  // 去行首 [xxx] 标记（"[可选] 柠檬汁" → "柠檬汁"）
  s = s.replace(/^\[[^\]]*\]\s*/, '').trim()
  // 去已知子段落标签前缀（"原料：半干荞麦面" → "半干荞麦面"）
  s = s.replace(KNOWN_LABEL_PREFIX, '').trim()
  // "食材名：数量" 格式：冒号后跟数字时，认为冒号后是数量描述，剥掉冒号及之后
  // 例："奶油奶酪：212g" → "奶油奶酪"; "白砂糖：60g" → "白砂糖"
  if (/[:：]\s*\d/.test(s)) {
    s = s.replace(/\s*[:：]\s*\d.*$/, '').trim()
  }
  // 全角逗号/顿号/斜杠/或字/加号视为食材分隔，只取第一段
  const segments = s.split(/[,，、/+]|\s+or\s+|或/)
  const first = segments[0]
  if (first !== undefined) s = first.trim()
  // 去掉括号注释及之后内容（中英文括号都处理）
  s = s.replace(/[（(].*$/, '').trim()
  // 行首"数字+量词+空格"前缀。可能有多层（"2cm 两段葱段" → "两段葱段" → "葱段"），循环剥到不变。
  let prev = ''
  while (prev !== s) {
    prev = s
    s = s.replace(LEADING_QUANTITY, '').trim()
  }
  // 行尾"数字+量词及之后"（"番茄 2 个 切片" → "番茄"）
  s = s.replace(TRAILING_QUANTITY, '').trim()
  // 反复剥离尾部噪声词，处理"切碎切丁"等组合后缀
  let changed = true
  while (changed) {
    changed = false
    for (const noise of INGREDIENT_TAIL_NOISE) {
      if (s.endsWith(noise)) {
        s = s.slice(0, -noise.length).trim()
        changed = true
      }
    }
  }
  // 同义词归一
  const synonym = SYNONYMS[s]
  if (synonym) s = synonym
  // 工具过滤
  if (TOOL_BLACKLIST.has(s)) return null
  // 长度卫生
  if (s.length === 0 || s.length > 12) return null
  return s
}

function parseRecipe(filePath: string, content: string, category: string): ParsedRecipe | null {
  const warnings: string[] = []
  const lines = content.split(/\r?\n/)

  // 标题
  const titleLine = lines.find((l) => l.startsWith('# '))
  if (!titleLine) return null
  const name = titleLine.replace(/^#\s+/, '').replace(/的做法$/, '').trim()
  if (!name) return null

  // 难度
  const difficultyLine = lines.find((l) => l.includes('预估烹饪难度'))
  const stars = difficultyLine ? (difficultyLine.match(/★/g) ?? []).length : 0
  if (stars === 0) warnings.push('未识别到难度星级，按 easy 处理')
  const difficulty = STAR_TO_DIFFICULTY(stars || 1)

  // 必备原料和工具 区段
  const ingredientsStart = lines.findIndex((l) => /^##\s*必备(原料|食材)/.test(l))
  if (ingredientsStart < 0) return null
  let ingredientsEnd = lines.findIndex((l, i) => i > ingredientsStart && /^##\s/.test(l))
  if (ingredientsEnd < 0) ingredientsEnd = lines.length

  const rawIngredients: string[] = []
  const ingredientsSet = new Set<string>()
  // 部分菜谱在「必备原料和工具」下又用「原料：/调味料：/工具：」做子分类，
  // 命中"工具："时跳过其下 bullet，直到下一个非工具子标题或区段结束。
  let inToolSubsection = false
  for (let i = ingredientsStart + 1; i < ingredientsEnd; i += 1) {
    const line = lines[i]
    if (!line) continue
    const trimmed = line.trim()
    if (INGREDIENT_ANY_SUBSECTION.test(trimmed)) {
      inToolSubsection = INGREDIENT_TOOL_SUBSECTION.test(trimmed)
      continue
    }
    if (!/^\s*[*\-+]\s+/.test(line)) continue
    if (inToolSubsection) continue
    rawIngredients.push(line.replace(/^\s*[*\-+]\s+/, '').trim())
    const normalized = normalizeIngredient(line)
    if (normalized) ingredientsSet.add(normalized)
  }
  const ingredients = [...ingredientsSet]
  if (ingredients.length === 0) {
    warnings.push('食材列表为空（可能全是工具或格式异常）')
    return null
  }

  // 操作步骤数
  const operationStart = lines.findIndex((l) => /^##\s*操作/.test(l))
  let stepsCount = 0
  if (operationStart >= 0) {
    let stepsEnd = lines.findIndex((l, i) => i > operationStart && /^##\s/.test(l))
    if (stepsEnd < 0) stepsEnd = lines.length
    for (let i = operationStart + 1; i < stepsEnd; i += 1) {
      const line = lines[i]
      if (line && /^\s*\d+\.\s+/.test(line)) stepsCount += 1
    }
  }
  const estimatedMinutes = STEPS_TO_MINUTES(stepsCount || 5)

  // 附加内容首条合理 bullet → reasonHint。跳过含 URL / Markdown 链接 / "做法参考"等不适合做推荐理由的行。
  let reasonHint = ''
  const extraStart = lines.findIndex((l) => /^##\s*附加内容/.test(l))
  if (extraStart >= 0) {
    for (let i = extraStart + 1; i < lines.length; i += 1) {
      const line = lines[i]?.trim()
      if (!line || !/^[*\-+]\s+/.test(line)) continue
      const candidate = line.replace(/^[*\-+]\s+/, '').trim()
      if (/https?:\/\//.test(candidate)) continue
      if (candidate.startsWith('[') || candidate.startsWith('做法参考')) continue
      // 跳过含 markdown 残留的行（**加粗**、内嵌链接等）以及全是符号的行
      if (/\*\*|^#+\s|^>\s/.test(candidate)) continue
      if (!/[一-龥a-zA-Z]/.test(candidate)) continue
      if (candidate.length < 6) continue
      reasonHint = candidate.slice(0, 60)
      break
    }
  }
  if (!reasonHint) reasonHint = `${category}类家常菜，难度 ${difficulty}`

  const imageUrl = extractImageUrl(lines, filePath)
  return {
    name,
    difficulty,
    estimatedMinutes,
    ingredients,
    rawIngredients,
    stepsCount,
    reasonHint,
    category,
    filePath,
    warnings,
    instructions: extractInstructions(lines),
    tips: extractTips(lines),
    imageUrl,
    sourceRefUrl: deriveSourceRefUrl(filePath),
    portions: extractPortions(lines),
    stepImages: extractStepImages(lines, filePath, imageUrl),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 文件扫描
// ────────────────────────────────────────────────────────────────────────────

function listMarkdownFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      results.push(...listMarkdownFiles(full))
    } else if (stat.isFile() && extname(entry) === '.md') {
      results.push(full)
    }
  }
  return results
}

function deriveCategory(relPath: string): string {
  const segments = relPath.split(/[\\/]/)
  // 形如 dishes/meat_dish/可乐鸡翅.md → meat_dish
  const idx = segments.indexOf('dishes')
  const next = segments[idx + 1]
  if (idx >= 0 && next) return next
  return 'other'
}

// ────────────────────────────────────────────────────────────────────────────
// 主流程
// ────────────────────────────────────────────────────────────────────────────

interface CliOptions {
  source: string
  confirm: boolean
  reset: boolean
  limit?: number
  migrateImages: boolean
}

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = { source: '.cache/howtocook-data', confirm: false, reset: false, migrateImages: false }
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--confirm') opts.confirm = true
    else if (arg === '--reset') opts.reset = true
    else if (arg === '--migrate-images') opts.migrateImages = true
    else if (arg === '--source') opts.source = args[i + 1] ?? opts.source
    else if (arg === '--limit') opts.limit = Number(args[i + 1])
  }
  return opts
}

async function main() {
  const opts = parseArgs(argv.slice(2))
  const dishesDir = join(opts.source, 'dishes')
  console.log(`\n=== HowToCook Recipe Import ${opts.confirm ? '(CONFIRM)' : '(DRY RUN)'} ===\n`)
  console.log(`source: ${opts.source}\n`)

  let allFiles: string[]
  try {
    allFiles = listMarkdownFiles(dishesDir)
  } catch (error) {
    console.error(`无法读取目录 ${dishesDir}，请确认已经执行 git clone --depth 1 https://github.com/Anduin2017/HowToCook.git ${opts.source}`)
    console.error(error)
    exit(1)
  }
  // 排除每个分类目录下的 README 之类
  const recipeFiles = allFiles.filter((f) => {
    const name = basename(f, '.md').toLowerCase()
    return name !== 'readme' && !name.startsWith('_')
  })
  console.log(`扫描到 ${recipeFiles.length} 个 markdown（已排除 README/隐藏文件）`)

  const sliced = opts.limit ? recipeFiles.slice(0, opts.limit) : recipeFiles

  const parsed: ParsedRecipe[] = []
  const failed: string[] = []
  for (const file of sliced) {
    const content = readFileSync(file, 'utf-8')
    const relPath = relative(opts.source, file)
    const category = deriveCategory(relPath)
    const recipe = parseRecipe(relPath, content, category)
    if (recipe) parsed.push(recipe)
    else failed.push(relPath)
  }

  const categoryStats: Record<string, number> = {}
  const difficultyStats: Record<string, number> = {}
  for (const r of parsed) {
    categoryStats[r.category] = (categoryStats[r.category] ?? 0) + 1
    difficultyStats[r.difficulty] = (difficultyStats[r.difficulty] ?? 0) + 1
  }

  console.log(`\n解析结果：`)
  console.log(`  ✓ 成功 ${parsed.length}`)
  console.log(`  ✗ 失败 ${failed.length}`)
  console.log(`\n按分类：`)
  for (const [cat, count] of Object.entries(categoryStats).sort()) {
    console.log(`  ${cat.padEnd(20)} ${count}`)
  }
  console.log(`\n按难度：`)
  for (const [diff, count] of Object.entries(difficultyStats).sort()) {
    console.log(`  ${diff.padEnd(8)} ${count}`)
  }

  console.log(`\n样本（前 5 条）：`)
  for (const r of parsed.slice(0, 5)) {
    console.log(`  - ${r.name} [${r.category}, ${r.difficulty}, ${r.estimatedMinutes}min]`)
    console.log(`      ingredients: ${r.ingredients.slice(0, 8).join(', ')}${r.ingredients.length > 8 ? '...' : ''}`)
    console.log(`      reason: ${r.reasonHint}`)
    console.log(`      image: ${r.imageUrl ?? '（无）'}`)
    console.log(`      instructions (${r.instructions.length} 步):`)
    for (const [idx, step] of r.instructions.slice(0, 3).entries()) {
      console.log(`        ${idx + 1}. ${step.slice(0, 80)}${step.length > 80 ? '...' : ''}`)
    }
    if (r.instructions.length > 3) console.log(`        ...(共 ${r.instructions.length} 步)`)
    if (r.tips) console.log(`      tips: ${r.tips.split('\n').slice(0, 2).join(' / ')}${r.tips.split('\n').length > 2 ? ' ...' : ''}`)
    if (r.portions) {
      console.log(`      portions: ${r.portions.description || '（无说明）'} · ${r.portions.items.length} 项`)
      for (const item of r.portions.items.slice(0, 3)) {
        console.log(`        - ${item.name}${item.amount ? ` ${item.amount}` : ''}`)
      }
      if (r.portions.items.length > 3) console.log(`        ...(共 ${r.portions.items.length} 项)`)
    }
    const stepImageCount = Object.keys(r.stepImages).length
    if (stepImageCount > 0) {
      const totalImgs = Object.values(r.stepImages).reduce((acc, arr) => acc + arr.length, 0)
      console.log(`      stepImages: ${stepImageCount} 步带图，共 ${totalImgs} 张`)
    }
  }

  if (failed.length > 0) {
    console.log(`\n失败文件（最多列 15 条，可能格式偏离模板）：`)
    for (const f of failed.slice(0, 15)) console.log(`  - ${f}`)
    if (failed.length > 15) console.log(`  ... 还有 ${failed.length - 15} 条`)
  }

  if (!opts.confirm) {
    console.log(`\nDry run 结束。如确认结果合理，加 --confirm 参数真正入库。`)
    return
  }

  // 真入库
  const prisma = new PrismaClient()
  try {
    // 兼容旧数据：source 字段是 2026-05 加入的，老数据 source=NULL。
    // 按 popularityScore 区分历史归属：=50 是上一批 HowToCook 数据；其他都是手工种子。
    const backfilledHowtocook = await prisma.recipeSuggestionRule.updateMany({
      where: { source: null, popularityScore: 50 },
      data: { source: SOURCE_ID },
    })
    const backfilledSeed = await prisma.recipeSuggestionRule.updateMany({
      where: { source: null },
      data: { source: 'seed' },
    })
    if (backfilledHowtocook.count > 0 || backfilledSeed.count > 0) {
      console.log(`\n[backfill] HowToCook 旧批次 ${backfilledHowtocook.count} 条 → source=${SOURCE_ID}；种子 ${backfilledSeed.count} 条 → source='seed'`)
    }

    const data: Prisma.RecipeSuggestionRuleCreateManyInput[] = parsed.map((r) => ({
      name: r.name,
      requiredIngredients: r.ingredients,
      optionalIngredients: [],
      missingIngredients: [],
      difficulty: r.difficulty,
      estimatedMinutes: r.estimatedMinutes,
      reasonTemplate: r.reasonHint,
      popularityScore: calculatePopularity(r.category, r.difficulty),
      source: SOURCE_ID,
      category: r.category,
      instructions: r.instructions,
      tips: r.tips,
      imageUrl: r.imageUrl,
      sourceRefUrl: r.sourceRefUrl,
      // Json? 字段：null 必须用 Prisma.JsonNull（写 SQL NULL），裸 null 会被 ts 类型系统拒绝
      portions: r.portions ?? Prisma.JsonNull,
      stepImages: Object.keys(r.stepImages).length > 0 ? r.stepImages : Prisma.JsonNull,
    }))
    const before = await prisma.recipeSuggestionRule.count()
    let resetCount = 0
    if (opts.reset) {
      // 按 source 字段精确清理本次导入源的旧批次，保留 seed.ts 等其他来源数据。
      // 这是脚本可重复运行的关键：每次 --reset 都基于最新词典与评分函数重新生成。
      const deleted = await prisma.recipeSuggestionRule.deleteMany({ where: { source: SOURCE_ID } })
      resetCount = deleted.count
      console.log(`\n[--reset] 已清理 source=${SOURCE_ID} 的旧记录 ${resetCount} 条`)
    }
    const result = await prisma.recipeSuggestionRule.createMany({ data, skipDuplicates: true })
    const after = await prisma.recipeSuggestionRule.count()
    console.log(`\n入库完成：`)
    console.log(`  数据库原有 ${before} 条${opts.reset ? `（清理 ${resetCount} 条后剩 ${before - resetCount}）` : ''}`)
    console.log(`  本次新写入 ${result.count} 条`)
    console.log(`  当前总数 ${after} 条`)

    // 评分分布速览，便于人眼检查打分是否合理
    const scoreStats = await prisma.recipeSuggestionRule.groupBy({
      by: ['popularityScore'],
      where: { source: SOURCE_ID },
      _count: true,
      orderBy: { popularityScore: 'desc' },
    })
    console.log(`\n${SOURCE_ID} 来源的 popularityScore 分布：`)
    for (const row of scoreStats) {
      console.log(`  ${String(row.popularityScore).padStart(3)} 分: ${row._count} 条`)
    }

    // 图片迁移：默认 imageUrl 入库为 raw.githubusercontent.com 直链，
    // --migrate-images 时顺手把新入库的图搬到 R2。逻辑复用 migrate-recipe-images.ts。
    if (opts.migrateImages) {
      console.log(`\n=== 迁移新批次图片到 R2 ===\n`)
      try {
        const bridge = createR2Bridge()
        console.log(`R2 ready → bucket=${bridge.bucket}\n`)
        const report = await migrateRawImagesToR2({
          prisma,
          bridge,
          concurrency: 4,
          onProgress: (done, total, last) => {
            if (done % 10 === 0 || done === total || !last.success) {
              console.log(`  [${done.toString().padStart(3)}/${total}] ${last.success ? '✓' : '✗'} ${last.name.slice(0, 30)}`)
            }
          },
        })
        console.log(`\n图片迁移：主图 ✓ ${report.success} (${(report.totalBytes / 1024 / 1024).toFixed(2)} MB)  ✗ ${report.failed}`)
        if (report.stepImagesUploaded > 0 || report.stepImagesFailed > 0) {
          console.log(`             步骤图 ✓ ${report.stepImagesUploaded}  ✗ ${report.stepImagesFailed}`)
        }
        if (report.failures.length > 0) {
          console.log(`\n失败清单（前 10 条；imageUrl 已置 null，imageSourceUrl 保留 raw URL 可后续重试）：`)
          for (const f of report.failures.slice(0, 10)) {
            console.log(`  - ${f.name}: ${f.error}`)
          }
        }
      } catch (error) {
        console.warn(`\n[migrate-images] R2 上传失败（菜谱已入库，但图仍是 raw URL）：`, error instanceof Error ? error.message : error)
        console.warn(`稍后可单独跑 prisma/migrate-recipe-images.ts --confirm 重试。`)
      }
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  exit(1)
})
