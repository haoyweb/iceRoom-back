import { HttpStatus } from '@nestjs/common'
import { NotificationPublicationStatus, NotificationStatus, NotificationTargetType, NotificationType, UserStatus } from '@prisma/client'
import { AdminNotificationsService } from './admin-notifications.service'

const OPERATOR_ID = 'admin_1'
const NOW = new Date('2026-05-29T08:00:00.000Z')

function createPublication(overrides: Partial<{
  id: string
  title: string
  content: string
  status: NotificationPublicationStatus
  targetCount: number
  successCount: number
  failedCount: number
  dedupeKey: string
  operatorId: string
  operatorName: string | null
  errorMessage: string | null
  createdAt: Date
  updatedAt: Date
}> = {}) {
  return {
    id: overrides.id ?? 'publication_1',
    title: overrides.title ?? '系统维护通知',
    content: overrides.content ?? '今晚 23:00-23:30 将进行系统维护。',
    status: overrides.status ?? NotificationPublicationStatus.pending,
    targetCount: overrides.targetCount ?? 0,
    successCount: overrides.successCount ?? 0,
    failedCount: overrides.failedCount ?? 0,
    dedupeKey: overrides.dedupeKey ?? 'system:admin_1:req_1',
    operatorId: overrides.operatorId ?? OPERATOR_ID,
    operatorName: overrides.operatorName ?? '管理员',
    errorMessage: overrides.errorMessage ?? null,
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  }
}

describe('AdminNotificationsService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('rejects blank system notification title before creating publication', async () => {
    const prisma = {
      user: { findUnique: jest.fn() },
      notificationPublication: { create: jest.fn() },
    }
    const service = new AdminNotificationsService(prisma as never)

    await expect(service.publishSystem({ title: '   ', content: '正常内容', clientRequestId: 'req_1' }, OPERATOR_ID)).rejects.toMatchObject({
      response: '通知标题和内容不能为空',
      status: HttpStatus.BAD_REQUEST,
    })
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(prisma.notificationPublication.create).not.toHaveBeenCalled()
  })

  it('rejects blank system notification content before creating publication', async () => {
    const prisma = {
      user: { findUnique: jest.fn() },
      notificationPublication: { create: jest.fn() },
    }
    const service = new AdminNotificationsService(prisma as never)

    await expect(service.publishSystem({ title: '正常标题', content: '   ', clientRequestId: 'req_1' }, OPERATOR_ID)).rejects.toMatchObject({
      response: '通知标题和内容不能为空',
      status: HttpStatus.BAD_REQUEST,
    })
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(prisma.notificationPublication.create).not.toHaveBeenCalled()
  })


  it('publishes system notification to active users only', async () => {
    const publication = createPublication()
    const completed = createPublication({ status: NotificationPublicationStatus.completed, targetCount: 2, successCount: 2 })
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: OPERATOR_ID, username: 'root', nickname: '管理员' }),
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn()
          .mockResolvedValueOnce([{ id: 'user_1' }, { id: 'user_2' }])
          .mockResolvedValueOnce([]),
      },
      notificationPublication: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(completed),
        create: jest.fn().mockResolvedValue(publication),
        update: jest.fn()
          .mockResolvedValueOnce(createPublication({ status: NotificationPublicationStatus.publishing, targetCount: 2 }))
          .mockResolvedValueOnce(completed),
      },
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        groupBy: jest.fn().mockResolvedValue([
          { publicationId: publication.id, status: NotificationStatus.unread, _count: { _all: 2 } },
        ]),
      },
    }
    const service = new AdminNotificationsService(prisma as never)

    await expect(service.publishSystem({ title: publication.title, content: publication.content, clientRequestId: 'req_1' }, OPERATOR_ID)).resolves.toEqual({
      ...completed,
      readCount: 0,
      unreadCount: 2,
    })

    expect(prisma.user.count).toHaveBeenCalledWith({ where: { status: UserStatus.active } })
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { status: UserStatus.active },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 500,
    })
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'user_1',
          type: NotificationType.system,
          title: publication.title,
          content: publication.content,
          status: NotificationStatus.unread,
          targetType: NotificationTargetType.none,
          publicationId: publication.id,
          dedupeKey: `system:${publication.id}:user_1`,
          metadata: {
            source: 'admin_publication',
            publicationId: publication.id,
            operatorId: OPERATOR_ID,
            operatorName: '管理员',
            publishedAt: NOW.toISOString(),
          },
        },
        {
          userId: 'user_2',
          type: NotificationType.system,
          title: publication.title,
          content: publication.content,
          status: NotificationStatus.unread,
          targetType: NotificationTargetType.none,
          publicationId: publication.id,
          dedupeKey: `system:${publication.id}:user_2`,
          metadata: {
            source: 'admin_publication',
            publicationId: publication.id,
            operatorId: OPERATOR_ID,
            operatorName: '管理员',
            publishedAt: NOW.toISOString(),
          },
        },
      ],
      skipDuplicates: true,
    })
  })

  it('returns existing publication for duplicated client request id', async () => {
    const existing = createPublication({ status: NotificationPublicationStatus.completed, targetCount: 1, successCount: 1 })
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: OPERATOR_ID, username: 'root', nickname: '管理员' }),
      },
      notificationPublication: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
      notification: {
        groupBy: jest.fn().mockResolvedValue([
          { publicationId: existing.id, status: NotificationStatus.read, _count: { _all: 1 } },
        ]),
      },
    }
    const service = new AdminNotificationsService(prisma as never)

    await expect(service.publishSystem({ title: existing.title, content: existing.content, clientRequestId: 'req_1' }, OPERATOR_ID)).resolves.toEqual({
      ...existing,
      readCount: 1,
      unreadCount: 0,
    })
    expect(prisma.notificationPublication.create).not.toHaveBeenCalled()
  })

  it('marks publication as partial failed when a later batch fails', async () => {
    const publication = createPublication()
    const partial = createPublication({
      status: NotificationPublicationStatus.partial_failed,
      targetCount: 2,
      successCount: 1,
      failedCount: 1,
      errorMessage: 'database temporarily unavailable',
    })
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: OPERATOR_ID, username: 'root', nickname: null }),
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn()
          .mockResolvedValueOnce([{ id: 'user_1' }])
          .mockResolvedValueOnce([{ id: 'user_2' }]),
      },
      notificationPublication: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(partial),
        create: jest.fn().mockResolvedValue(publication),
        update: jest.fn()
          .mockResolvedValueOnce(createPublication({ status: NotificationPublicationStatus.publishing, targetCount: 2 }))
          .mockResolvedValueOnce(partial),
      },
      notification: {
        createMany: jest.fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockRejectedValueOnce(new Error('database temporarily unavailable')),
        groupBy: jest.fn().mockResolvedValue([
          { publicationId: publication.id, status: NotificationStatus.unread, _count: { _all: 1 } },
        ]),
      },
    }
    const service = new AdminNotificationsService(prisma as never)

    await expect(service.publishSystem({ title: publication.title, content: publication.content, clientRequestId: 'req_1' }, OPERATOR_ID)).resolves.toEqual({
      ...partial,
      readCount: 0,
      unreadCount: 1,
    })
    expect(prisma.notificationPublication.update).toHaveBeenLastCalledWith({
      where: { id: publication.id },
      data: {
        status: NotificationPublicationStatus.partial_failed,
        successCount: 1,
        failedCount: 1,
        errorMessage: 'database temporarily unavailable',
      },
    })
  })

  it('lists publications with grouped read stats', async () => {
    const first = createPublication({ id: 'publication_1', successCount: 3 })
    const second = createPublication({ id: 'publication_2', successCount: 2 })
    const prisma = {
      notificationPublication: {
        findMany: jest.fn().mockResolvedValue([first, second]),
        count: jest.fn().mockResolvedValue(2),
      },
      notification: {
        groupBy: jest.fn().mockResolvedValue([
          { publicationId: 'publication_1', status: NotificationStatus.read, _count: { _all: 1 } },
          { publicationId: 'publication_1', status: NotificationStatus.unread, _count: { _all: 2 } },
          { publicationId: 'publication_2', status: NotificationStatus.unread, _count: { _all: 2 } },
        ]),
      },
    }
    const service = new AdminNotificationsService(prisma as never)

    await expect(service.list({ page: 1, pageSize: 20 })).resolves.toEqual({
      list: [
        { ...first, readCount: 1, unreadCount: 2 },
        { ...second, readCount: 0, unreadCount: 2 },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    })
    expect(prisma.notification.groupBy).toHaveBeenCalledWith({
      by: ['publicationId', 'status'],
      where: { publicationId: { in: ['publication_1', 'publication_2'] } },
      _count: { _all: true },
    })
  })
})
