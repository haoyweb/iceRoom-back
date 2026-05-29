import { HttpStatus, Injectable } from '@nestjs/common'
import { NotificationPublicationStatus, NotificationStatus, NotificationTargetType, NotificationType, Prisma, UserStatus } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { createPageResult } from '@/common/dto/page.dto'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { PrismaService } from '@/database/prisma.service'
import type { ListNotificationPublicationsQueryDto } from './dto/list-notification-publications.query.dto'
import type { PublishSystemNotificationDto } from './dto/publish-system-notification.dto'

const BATCH_SIZE = 500

type PublicationRow = Prisma.NotificationPublicationGetPayload<object>

interface PublicationStats {
  readCount: number
  unreadCount: number
}

@Injectable()
export class AdminNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListNotificationPublicationsQueryDto) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const keyword = query.keyword?.trim()
    const where: Prisma.NotificationPublicationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword, mode: 'insensitive' } },
              { content: { contains: keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const [rows, total] = await Promise.all([
      this.prisma.notificationPublication.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notificationPublication.count({ where }),
    ])

    const stats = await this.getPublicationStats(rows.map(row => row.id))
    return createPageResult(rows.map(row => this.withStats(row, stats)), total, page, pageSize)
  }

  async publishSystem(dto: PublishSystemNotificationDto, operatorId: string) {
    const title = dto.title.trim()
    const content = dto.content.trim()
    if (!title || !content) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '通知标题和内容不能为空', HttpStatus.BAD_REQUEST)
    }
    const clientRequestId = dto.clientRequestId?.trim()

    const operator = await this.prisma.user.findUnique({
      where: { id: operatorId },
      select: { id: true, username: true, nickname: true },
    })

    if (!operator) {
      throw new BusinessException(ErrorCode.USER_NOT_FOUND, '操作者不存在', HttpStatus.NOT_FOUND)
    }
    const dedupeKey = clientRequestId
      ? `system:${operatorId}:${clientRequestId}`
      : `system:${operatorId}:${Date.now()}:${randomUUID()}`

    if (clientRequestId) {
      const existing = await this.prisma.notificationPublication.findUnique({ where: { dedupeKey } })
      if (existing) {
        return this.getByIdWithStats(existing.id)
      }
    }

    let publication: PublicationRow
    try {
      publication = await this.prisma.notificationPublication.create({
        data: {
          title,
          content,
          dedupeKey,
          operatorId: operator.id,
          operatorName: operator.nickname ?? operator.username,
        },
      })
    }
    catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.notificationPublication.findUnique({ where: { dedupeKey } })
        if (existing) {
          return this.getByIdWithStats(existing.id)
        }
      }
      throw err
    }

    return this.deliver(publication)
  }

  private async deliver(publication: PublicationRow) {
    const targetCount = await this.prisma.user.count({ where: { status: UserStatus.active } })
    await this.prisma.notificationPublication.update({
      where: { id: publication.id },
      data: { status: NotificationPublicationStatus.publishing, targetCount },
    })

    let successCount = 0
    try {
      let cursor: string | undefined
      while (true) {
        const users = await this.prisma.user.findMany({
          where: { status: UserStatus.active },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        })

        if (users.length === 0) {
          break
        }

        const result = await this.prisma.notification.createMany({
          data: users.map(user => ({
            userId: user.id,
            type: NotificationType.system,
            title: publication.title,
            content: publication.content,
            status: NotificationStatus.unread,
            targetType: NotificationTargetType.none,
            publicationId: publication.id,
            dedupeKey: `system:${publication.id}:${user.id}`,
            metadata: {
              source: 'admin_publication',
              publicationId: publication.id,
              operatorId: publication.operatorId,
              operatorName: publication.operatorName,
              publishedAt: publication.createdAt.toISOString(),
            } satisfies Prisma.InputJsonValue,
          })),
          skipDuplicates: true,
        })

        successCount += result.count
        cursor = users.at(-1)?.id
      }

      const failedCount = Math.max(targetCount - successCount, 0)
      const status = failedCount > 0
        ? NotificationPublicationStatus.partial_failed
        : NotificationPublicationStatus.completed

      const updated = await this.prisma.notificationPublication.update({
        where: { id: publication.id },
        data: { status, successCount, failedCount, errorMessage: null },
      })
      return this.getByIdWithStats(updated.id)
    }
    catch (err) {
      const failedCount = Math.max(targetCount - successCount, 0)
      const updated = await this.prisma.notificationPublication.update({
        where: { id: publication.id },
        data: {
          status: successCount > 0 ? NotificationPublicationStatus.partial_failed : NotificationPublicationStatus.failed,
          successCount,
          failedCount,
          errorMessage: err instanceof Error ? err.message : '发布失败',
        },
      })
      return this.getByIdWithStats(updated.id)
    }
  }

  private async getByIdWithStats(id: string) {
    const publication = await this.prisma.notificationPublication.findUnique({ where: { id } })
    if (!publication) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '通知发布记录不存在', HttpStatus.NOT_FOUND)
    }

    const stats = await this.getPublicationStats([id])
    return this.withStats(publication, stats)
  }

  private async getPublicationStats(publicationIds: string[]) {
    const result = new Map<string, PublicationStats>()
    if (publicationIds.length === 0) {
      return result
    }

    const rows = await this.prisma.notification.groupBy({
      by: ['publicationId', 'status'],
      where: { publicationId: { in: publicationIds } },
      _count: { _all: true },
    })

    rows.forEach((row) => {
      if (!row.publicationId) {
        return
      }
      const current = result.get(row.publicationId) ?? { readCount: 0, unreadCount: 0 }
      if (row.status === NotificationStatus.read) {
        current.readCount = row._count._all
      }
      else {
        current.unreadCount = row._count._all
      }
      result.set(row.publicationId, current)
    })

    return result
  }

  private withStats(row: PublicationRow, stats: Map<string, PublicationStats>) {
    const current = stats.get(row.id) ?? { readCount: 0, unreadCount: 0 }
    return {
      ...row,
      readCount: current.readCount,
      unreadCount: current.unreadCount,
    }
  }
}
