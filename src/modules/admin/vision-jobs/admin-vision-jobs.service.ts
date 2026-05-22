import { HttpStatus, Injectable } from '@nestjs/common'
import { Prisma, VisionRecognitionStatus } from '@prisma/client'
import { createPageResult } from '@/common/dto/page.dto'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { PrismaService } from '@/database/prisma.service'
import type { ListVisionJobsQueryDto, VisionJobsStatsQueryDto } from './dto/list-jobs.query.dto'

/**
 * 运营后台 AI 识别监控。
 *
 * 与 C 端 VisionRecognitionService 的差异：
 *   - 跨用户：不按 userId 过滤（除非显式传 userId）
 *   - join user 拿 username / nickname 展示
 *   - stats 端点做轻量聚合（总数、成功率、token、cost）
 *
 * 不在这里做删除/重跑——识别失败后，原 service 已经把 status=failed 写入，
 * 用户可以重新拍照触发新任务。运营如果想"重跑历史照片"在 MVP 之外，不实现。
 */
@Injectable()
export class AdminVisionJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListVisionJobsQueryDto) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const where = this.buildWhere(query)

    const [jobs, total] = await Promise.all([
      this.prisma.visionRecognitionJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          userId: true,
          fridgeId: true,
          status: true,
          requestedSourceType: true,
          detectedSourceType: true,
          provider: true,
          model: true,
          itemCount: true,
          imageUrl: true,
          imageExpiresAt: true,
          errorMessage: true,
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
          costUSD: true,
          confirmedAt: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { username: true, nickname: true } },
        },
      }),
      this.prisma.visionRecognitionJob.count({ where }),
    ])

    const list = jobs.map(job => ({
      ...job,
      username: job.user.username,
      nickname: job.user.nickname,
      user: undefined,
    }))

    return createPageResult(list, total, page, pageSize)
  }

  async getById(id: string) {
    const job = await this.prisma.visionRecognitionJob.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, nickname: true, avatar: true } },
      },
    })
    if (!job) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '识别记录不存在', HttpStatus.NOT_FOUND)
    }
    return job
  }

  async stats(query: VisionJobsStatsQueryDto) {
    const where = this.buildWhere(query)

    // 单次 5 个查询并行——总数、成功数、失败数、token/cost 聚合、provider 分布
    const [totalJobs, successCount, failedCount, sums, providerGroup] = await Promise.all([
      this.prisma.visionRecognitionJob.count({ where }),
      this.prisma.visionRecognitionJob.count({
        where: { ...where, status: VisionRecognitionStatus.success },
      }),
      this.prisma.visionRecognitionJob.count({
        where: { ...where, status: VisionRecognitionStatus.failed },
      }),
      this.prisma.visionRecognitionJob.aggregate({
        where,
        _sum: { totalTokens: true, costUSD: true },
      }),
      this.prisma.visionRecognitionJob.groupBy({
        by: ['provider'],
        where,
        _count: { _all: true },
        _sum: { totalTokens: true, costUSD: true },
      }),
    ])

    return {
      totalJobs,
      successCount,
      failedCount,
      totalTokens: sums._sum.totalTokens ?? 0,
      totalCostUSD: sums._sum.costUSD?.toString() ?? '0',
      providerBreakdown: providerGroup.map(p => ({
        provider: p.provider ?? 'unknown',
        jobCount: p._count._all,
        totalTokens: p._sum.totalTokens ?? 0,
        totalCostUSD: p._sum.costUSD?.toString() ?? '0',
      })),
    }
  }

  private buildWhere(query: {
    status?: VisionRecognitionStatus
    provider?: string
    userId?: string
    dateFrom?: Date
    dateTo?: Date
  }): Prisma.VisionRecognitionJobWhereInput {
    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: query.dateFrom } : {}),
              ...(query.dateTo ? { lte: query.dateTo } : {}),
            },
          }
        : {}),
    }
  }
}
