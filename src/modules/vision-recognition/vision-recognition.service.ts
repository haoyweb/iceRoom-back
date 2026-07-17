import { HttpStatus, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma, UserRole, VisionRecognitionStatus } from '@prisma/client'
import { createPageResult } from '@/common/dto/page.dto'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { PrismaService } from '@/database/prisma.service'
import { FridgeService } from '@/modules/fridge/fridge.service'
import { SettingsService } from '@/modules/settings/settings.service'
import { StorageService } from '@/modules/storage/storage.service'
import type { RecognizeIngredientsDto } from './dto/recognize-ingredients.dto'
import type { IgnoredRecognitionItemDto, RecognizedIngredientDto } from './dto/recognized-ingredient.dto'
import type { VisionRecognitionJobQueryDto } from './dto/vision-recognition-job-query.dto'
import type { UploadedImageFile } from './vision-recognition.types'
import { VisionIngredientProviderFactory } from './providers/vision-ingredient-provider.factory'

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const RECOGNITION_IMAGE_RETENTION_DAYS = 90
const STALE_PENDING_JOB_MS = 90 * 1000
const CHINA_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000

interface RecognitionImagePayload {
  buffer: Buffer
  mimetype: string
}

@Injectable()
export class VisionRecognitionService {
  constructor(
    private readonly configService: ConfigService,
    private readonly fridgeService: FridgeService,
    private readonly prisma: PrismaService,
    private readonly providerFactory: VisionIngredientProviderFactory,
    private readonly settingsService: SettingsService,
    private readonly storageService: StorageService,
  ) {}

  async createIngredientJob(file: UploadedImageFile | undefined, data: RecognizeIngredientsDto, userId: string) {
    await this.assertVisionRecognitionEnabled()
    void this.cleanupExpiredImages(userId).catch(() => undefined)
    this.validateImage(file)
    await this.validateContext(data, userId)
    await this.assertVisionDailyQuota(userId)

    const job = await this.prisma.visionRecognitionJob.create({
      data: {
        userId,
        fridgeId: data.fridgeId,
        shelfId: data.shelfId,
        requestedSourceType: data.sourceType ?? 'auto',
      },
      select: {
        id: true,
        status: true,
        fridgeId: true,
        shelfId: true,
        requestedSourceType: true,
        createdAt: true,
      },
    })

    const image = { buffer: Buffer.from(file!.buffer), mimetype: file!.mimetype }
    void this.saveRecognitionImage(job.id, userId, image).catch(() => undefined)
    void this.processIngredientJob(job.id, image, data).catch(() => undefined)

    return job
  }

  async listIngredientJobs(query: VisionRecognitionJobQueryDto, userId: string) {
    await Promise.all([
      this.cleanupExpiredImages(userId),
      this.expireStalePendingJobs(userId),
    ])
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const where: Prisma.VisionRecognitionJobWhereInput = {
      userId,
      status: query.status,
      fridgeId: query.fridgeId,
    }

    const [jobs, total] = await Promise.all([
      this.prisma.visionRecognitionJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.visionRecognitionJob.count({ where }),
    ])

    return createPageResult(jobs.map(job => this.toListItem(job)), total, page, pageSize)
  }

  async getIngredientJob(id: string, userId: string) {
    const job = await this.prisma.visionRecognitionJob.findFirst({
      where: { id, userId },
    })

    if (!job) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '识别记录不存在', HttpStatus.NOT_FOUND)
    }

    return this.toDetail(job)
  }

  async markIngredientJobConfirmed(id: string, userId: string) {
    await this.getIngredientJob(id, userId)

    const job = await this.prisma.visionRecognitionJob.update({
      where: { id },
      data: { confirmedAt: new Date() },
    })

    return this.toDetail(job)
  }

  async deleteIngredientJob(id: string, userId: string) {
    const job = await this.prisma.visionRecognitionJob.findFirst({
      where: { id, userId },
    })

    if (!job) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '识别记录不存在', HttpStatus.NOT_FOUND)
    }

    await this.deleteImageIfPossible(job.imageUrl)
    await this.prisma.visionRecognitionJob.delete({ where: { id } })
    void this.cleanupExpiredImages(userId).catch(() => undefined)

    return { id, deleted: true }
  }

  private async saveRecognitionImage(jobId: string, userId: string, image: RecognitionImagePayload) {
    if (!this.storageService.isReady()) {
      return
    }

    try {
      const imageUrl = await this.storageService.upload(
        this.buildRecognitionImageKey(userId, jobId, image.mimetype),
        image.buffer,
        image.mimetype,
      )
      await this.prisma.visionRecognitionJob.updateMany({
        where: { id: jobId },
        data: {
          imageUrl,
          imageExpiresAt: this.addDays(new Date(), RECOGNITION_IMAGE_RETENTION_DAYS),
        },
      })
    }
    catch {
      // 图片只用于识别记录回溯，上传失败不能阻断识别任务本身。
    }
  }

  private async processIngredientJob(jobId: string, image: RecognitionImagePayload, data: RecognizeIngredientsDto) {
    try {
      const result = await this.providerFactory.getProvider().recognizeIngredients({
        imageBuffer: image.buffer,
        mimeType: image.mimetype,
        context: data.context,
        locale: data.locale ?? 'zh-CN',
        sourceType: data.sourceType ?? 'auto',
      })

      const cost = this.calcCost(result.provider, result.inputTokens, result.outputTokens)

      await this.prisma.visionRecognitionJob.updateMany({
        where: { id: jobId },
        data: {
          status: VisionRecognitionStatus.success,
          provider: result.provider,
          model: result.model,
          detectedSourceType: result.sourceType,
          items: result.items as unknown as Prisma.InputJsonValue,
          ignored: (result.ignored ?? []) as unknown as Prisma.InputJsonValue,
          warnings: result.warnings ?? [],
          itemCount: result.items.length,
          errorMessage: null,
          inputTokens: result.inputTokens ?? null,
          outputTokens: result.outputTokens ?? null,
          totalTokens: result.totalTokens ?? null,
          costUSD: cost,
        },
      })
    }
    catch (error) {
      await this.prisma.visionRecognitionJob.updateMany({
        where: { id: jobId },
        data: {
          status: VisionRecognitionStatus.failed,
          errorMessage: error instanceof Error ? error.message : '识别失败，请重新拍照试试',
        },
      })
    }
  }

  /**
   * 按 provider 算 USD 成本。
   *
   * - 未知 provider 或缺 token 数 → null
   * - 费率未配置（0）→ null
   * - 用 Decimal(10,6) 存，最多 6 位小数。Prisma 接受 string|number|Decimal，传 string 最稳。
   */
  private calcCost(provider: string, inputTokens: number | undefined, outputTokens: number | undefined): string | null {
    if (inputTokens === undefined && outputTokens === undefined) {
      return null
    }
    if (provider !== 'qwen') {
      return null
    }
    const inputPer1k = this.configService.get<number>('visionRecognition.qwen.inputUsdPer1k') ?? 0
    const outputPer1k = this.configService.get<number>('visionRecognition.qwen.outputUsdPer1k') ?? 0
    if (inputPer1k <= 0 && outputPer1k <= 0) {
      return null
    }
    const inputCost = (inputTokens ?? 0) / 1000 * inputPer1k
    const outputCost = (outputTokens ?? 0) / 1000 * outputPer1k
    const total = inputCost + outputCost
    if (!Number.isFinite(total) || total <= 0) {
      return null
    }
    return total.toFixed(6)
  }

  private async assertVisionRecognitionEnabled() {
    if (await this.settingsService.isVisionRecognitionEnabled()) {
      return
    }
    throw new BusinessException(ErrorCode.VISION_RECOGNITION_DISABLED, '拍照识别功能已关闭', HttpStatus.FORBIDDEN)
  }

  private async assertVisionDailyQuota(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, visionDailyLimit: true },
    })

    if (!user) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '未登录', HttpStatus.UNAUTHORIZED)
    }

    if (user.role === UserRole.super_admin) {
      return
    }

    const { start, end } = this.getChinaTodayRange()
    const used = await this.prisma.visionRecognitionJob.count({
      where: {
        userId,
        createdAt: { gte: start, lt: end },
      },
    })

    if (used >= user.visionDailyLimit) {
      throw new BusinessException(
        ErrorCode.VISION_DAILY_LIMIT_EXCEEDED,
        '今日拍照识别次数已用完，请明天再试',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
  }

  private getChinaTodayRange(now = new Date()) {
    const chinaNow = new Date(now.getTime() + CHINA_TIMEZONE_OFFSET_MS)
    const startOfChinaDayAsUtc = Date.UTC(
      chinaNow.getUTCFullYear(),
      chinaNow.getUTCMonth(),
      chinaNow.getUTCDate(),
      0,
      0,
      0,
      0,
    )
    return {
      start: new Date(startOfChinaDayAsUtc - CHINA_TIMEZONE_OFFSET_MS),
      end: new Date(startOfChinaDayAsUtc + 24 * 60 * 60 * 1000 - CHINA_TIMEZONE_OFFSET_MS),
    }
  }

  private async validateContext(data: RecognizeIngredientsDto, userId: string) {
    if (data.shelfId && !data.fridgeId) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '选择层位时必须同时指定冰箱', HttpStatus.BAD_REQUEST)
    }

    if (data.fridgeId) {
      await this.fridgeService.ensureFridgeOwnedByUser(data.fridgeId, userId)
      if (data.shelfId) {
        await this.fridgeService.ensureShelfBelongsToFridge(data.fridgeId, data.shelfId)
      }
    }
  }

  private validateImage(file: UploadedImageFile | undefined) {
    if (!file) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请上传食材照片', HttpStatus.BAD_REQUEST)
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '仅支持 JPG、PNG 或 WebP 图片', HttpStatus.BAD_REQUEST)
    }

    const maxImageBytes = this.configService.get<number>('visionRecognition.maxImageBytes') ?? 5242880
    if (file.size > maxImageBytes) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '图片过大，请选择更小的图片', HttpStatus.BAD_REQUEST)
    }
  }

  private toListItem(job: Prisma.VisionRecognitionJobGetPayload<object>) {
    return {
      id: job.id,
      status: job.status,
      fridgeId: job.fridgeId,
      shelfId: job.shelfId,
      requestedSourceType: job.requestedSourceType,
      detectedSourceType: job.detectedSourceType,
      provider: job.provider,
      model: job.model,
      itemCount: job.itemCount,
      warningCount: job.warnings.length,
      imageUrl: job.imageUrl,
      imageExpiresAt: job.imageExpiresAt,
      errorMessage: job.errorMessage,
      confirmedAt: job.confirmedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }
  }

  private toDetail(job: Prisma.VisionRecognitionJobGetPayload<object>) {
    return {
      ...this.toListItem(job),
      items: this.toArray<RecognizedIngredientDto>(job.items),
      ignored: this.toArray<IgnoredRecognitionItemDto>(job.ignored),
      warnings: job.warnings,
    }
  }

  private toArray<T>(value: Prisma.JsonValue | null): T[] {
    return Array.isArray(value) ? value as T[] : []
  }

  private async expireStalePendingJobs(userId: string) {
    await this.prisma.visionRecognitionJob.updateMany({
      where: {
        userId,
        status: VisionRecognitionStatus.pending,
        createdAt: { lt: new Date(Date.now() - STALE_PENDING_JOB_MS) },
      },
      data: {
        status: VisionRecognitionStatus.failed,
        errorMessage: '识别等待太久了，请换一张更清晰的照片重试',
      },
    })
  }

  private async cleanupExpiredImages(userId: string) {
    const expiredJobs = await this.prisma.visionRecognitionJob.findMany({
      where: {
        userId,
        imageUrl: { not: null },
        imageExpiresAt: { lte: new Date() },
      },
      select: { id: true, imageUrl: true },
      take: 20,
    })

    for (const job of expiredJobs) {
      await this.deleteImageIfPossible(job.imageUrl)
      await this.prisma.visionRecognitionJob.update({
        where: { id: job.id },
        data: { imageUrl: null, imageExpiresAt: null },
      })
    }
  }

  private async deleteImageIfPossible(imageUrl: string | null) {
    const key = this.toStorageKey(imageUrl)
    if (!key || !this.storageService.isReady()) {
      return
    }

    try {
      await this.storageService.delete(key)
    }
    catch {
      // 删除记录/清理过期图时，R2 删除失败不应阻断用户操作。
    }
  }

  private toStorageKey(imageUrl: string | null) {
    if (!imageUrl) {
      return null
    }
    const publicUrl = this.configService.get<string>('storage.r2.publicUrl')?.replace(/\/+$/, '')
    if (!publicUrl || !imageUrl.startsWith(`${publicUrl}/`)) {
      return null
    }
    return imageUrl.slice(publicUrl.length + 1)
  }

  private buildRecognitionImageKey(userId: string, jobId: string, mimeType: string) {
    const ext = this.extensionFromMime(mimeType)
    return `recognitions/${userId}/${jobId}.${ext}`
  }

  private extensionFromMime(mimeType: string) {
    if (mimeType === 'image/png') return 'png'
    if (mimeType === 'image/webp') return 'webp'
    return 'jpg'
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
  }
}
