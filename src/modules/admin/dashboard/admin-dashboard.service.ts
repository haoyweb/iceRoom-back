import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '@/database/prisma.service'

interface DateRow {
  date: Date
}

interface UserTrendRow extends DateRow {
  newUsers: bigint | number
}

interface ActiveUsersRow extends DateRow {
  activeUsers: bigint | number
}

interface FoodTrendRow extends DateRow {
  addedFoods: bigint | number
}

interface VisionTrendRow extends DateRow {
  jobs: bigint | number
  successJobs: bigint | number
  costUSD: Prisma.Decimal | string | null
}

/**
 * 运营数据看板。
 *
 * 时间序列查询用 PostgreSQL `date_trunc('day', "createdAt")` + GROUP BY，
 * Prisma 没有原生的「按日聚合」API，所以走 `$queryRaw`——可读性 vs 性能取后者。
 *
 * 日期补零策略：service 内填充缺失日期（值为 0），前端 ECharts 不用再处理空洞。
 */
@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [
      userCount,
      activeUsers7d,
      foodCount,
      visionJobCount,
      todayCostAgg,
      totalCostAgg,
    ] = await Promise.all([
      this.prisma.user.count(),
      // 7 日活跃 = 7 日内有食材入库或识别任务的去重用户数
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "userId") AS count FROM (
          SELECT "userId" FROM "VisionRecognitionJob" WHERE "createdAt" >= ${sevenDaysAgo}
          UNION
          SELECT f."userId" FROM "FoodItem" fi
            JOIN "Fridge" f ON f.id = fi."fridgeId"
            WHERE fi."createdAt" >= ${sevenDaysAgo}
        ) AS active
      `.then(rows => Number(rows[0]?.count ?? 0)),
      this.prisma.foodItem.count(),
      this.prisma.visionRecognitionJob.count(),
      this.prisma.visionRecognitionJob.aggregate({
        where: { createdAt: { gte: todayStart } },
        _sum: { costUSD: true },
      }),
      this.prisma.visionRecognitionJob.aggregate({
        _sum: { costUSD: true },
      }),
    ])

    return {
      userCount,
      activeUserCount7d: activeUsers7d,
      foodCount,
      visionJobCount,
      todayCostUSD: todayCostAgg._sum.costUSD?.toString() ?? '0',
      totalCostUSD: totalCostAgg._sum.costUSD?.toString() ?? '0',
    }
  }

  async userTrend(days: number) {
    const since = this.buildSince(days)

    const [newUsersRows, activeUsersRows] = await Promise.all([
      this.prisma.$queryRaw<UserTrendRow[]>`
        SELECT date_trunc('day', "createdAt")::date AS date, COUNT(*)::bigint AS "newUsers"
        FROM "User"
        WHERE "createdAt" >= ${since}
        GROUP BY date_trunc('day', "createdAt")
        ORDER BY date ASC
      `,
      this.prisma.$queryRaw<ActiveUsersRow[]>`
        SELECT day::date AS date, COUNT(DISTINCT "userId")::bigint AS "activeUsers"
        FROM (
          SELECT date_trunc('day', "createdAt") AS day, "userId" FROM "VisionRecognitionJob"
            WHERE "createdAt" >= ${since}
          UNION ALL
          SELECT date_trunc('day', fi."createdAt") AS day, f."userId"
            FROM "FoodItem" fi JOIN "Fridge" f ON f.id = fi."fridgeId"
            WHERE fi."createdAt" >= ${since}
        ) AS active
        GROUP BY day
        ORDER BY day ASC
      `,
    ])

    const dates = this.buildDateAxis(days)
    const newUsersMap = new Map(newUsersRows.map(r => [this.toDateKey(r.date), Number(r.newUsers)]))
    const activeMap = new Map(activeUsersRows.map(r => [this.toDateKey(r.date), Number(r.activeUsers)]))

    return dates.map(d => ({
      date: d,
      newUsers: newUsersMap.get(d) ?? 0,
      activeUsers: activeMap.get(d) ?? 0,
    }))
  }

  async foodTrend(days: number) {
    const since = this.buildSince(days)
    const rows = await this.prisma.$queryRaw<FoodTrendRow[]>`
      SELECT date_trunc('day', "createdAt")::date AS date, COUNT(*)::bigint AS "addedFoods"
      FROM "FoodItem"
      WHERE "createdAt" >= ${since}
      GROUP BY date_trunc('day', "createdAt")
      ORDER BY date ASC
    `

    const dates = this.buildDateAxis(days)
    const map = new Map(rows.map(r => [this.toDateKey(r.date), Number(r.addedFoods)]))
    return dates.map(d => ({
      date: d,
      addedFoods: map.get(d) ?? 0,
    }))
  }

  async visionTrend(days: number) {
    const since = this.buildSince(days)
    const rows = await this.prisma.$queryRaw<VisionTrendRow[]>`
      SELECT
        date_trunc('day', "createdAt")::date AS date,
        COUNT(*)::bigint AS jobs,
        COUNT(*) FILTER (WHERE "status" = 'success')::bigint AS "successJobs",
        COALESCE(SUM("costUSD"), 0) AS "costUSD"
      FROM "VisionRecognitionJob"
      WHERE "createdAt" >= ${since}
      GROUP BY date_trunc('day', "createdAt")
      ORDER BY date ASC
    `

    const dates = this.buildDateAxis(days)
    const map = new Map(
      rows.map(r => [
        this.toDateKey(r.date),
        {
          jobs: Number(r.jobs),
          successJobs: Number(r.successJobs),
          costUSD: r.costUSD?.toString() ?? '0',
        },
      ]),
    )
    return dates.map(d => ({
      date: d,
      jobs: map.get(d)?.jobs ?? 0,
      successJobs: map.get(d)?.successJobs ?? 0,
      costUSD: map.get(d)?.costUSD ?? '0',
    }))
  }

  /**
   * 生成回看起点：从「今天 00:00 - (days-1) 天」开始，这样 days=7 拿到的就是包含今天的 7 天连续区间。
   */
  private buildSince(days: number): Date {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
  }

  /**
   * 生成连续日期键（YYYY-MM-DD）。
   * 不靠 DB 输出做断点检测——直接前端要展示的 N 天键全列出来，再用 map 补零。
   */
  private buildDateAxis(days: number): string[] {
    const result: string[] = []
    const since = this.buildSince(days)
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000)
      result.push(this.toDateKey(d))
    }
    return result
  }

  private toDateKey(d: Date): string {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
}
