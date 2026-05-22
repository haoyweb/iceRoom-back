import { HttpStatus, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FoodCategory } from '@prisma/client'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import type { IgnoredRecognitionItemDto, RecognizeIngredientsResultDto, RecognizedIngredientDto, RecognizedSourceType } from '../dto/recognized-ingredient.dto'
import type { VisionIngredientProvider, VisionIngredientProviderInput } from './vision-ingredient-provider.interface'

interface QwenChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  // DashScope 兼容协议返回的 usage 对象。字段命名沿用 OpenAI 风格 prompt/completion/total_tokens。
  // 部分模型可能不返回 usage 或字段不齐——解析时全用 ?? null 兜底，绝不让缺字段拖垮主流程。
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

interface RawRecognitionResult {
  sourceType?: unknown
  items?: unknown[]
  ignored?: unknown[]
  warnings?: unknown[]
}

const FOOD_CATEGORIES = new Set<string>(Object.values(FoodCategory))
const SOURCE_TYPES = new Set<RecognizedSourceType>(['photo', 'receipt', 'screenshot', 'package', 'unknown'])

@Injectable()
export class QwenVisionIngredientProvider implements VisionIngredientProvider {
  readonly name = 'qwen'

  constructor(private readonly configService: ConfigService) {}

  async recognizeIngredients(input: VisionIngredientProviderInput): Promise<RecognizeIngredientsResultDto> {
    const apiKey = this.configService.get<string>('visionRecognition.qwen.apiKey') ?? ''
    const baseUrl = this.configService.get<string>('visionRecognition.qwen.baseUrl') ?? ''
    const model = this.configService.get<string>('visionRecognition.qwen.model') ?? 'qwen3-vl-flash'
    const timeoutMs = this.configService.get<number>('visionRecognition.timeoutMs') ?? 20000

    if (!apiKey) {
      throw new BusinessException(ErrorCode.INTERNAL_ERROR, '视觉识别服务暂未配置', HttpStatus.SERVICE_UNAVAILABLE)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: '你是面向冰箱库存管理 App 的食材入库识别助手。图片可能是食材实物、超市购物小票、买菜 App/电商订单截图或食品包装。你只识别应该加入冰箱库存的食材/食品，忽略购物袋、配送费、优惠券、满减、会员积分、合计金额、支付金额、订单号、广告推荐商品。类别只能是 vegetable, fruit, meat, egg_milk, staple, seasoning, other。只返回严格 JSON，不要 Markdown。',
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: this.buildPrompt(input.context, input.locale, input.sourceType),
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${input.mimeType};base64,${input.imageBuffer.toString('base64')}`,
                  },
                },
              ],
            },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new BusinessException(ErrorCode.INTERNAL_ERROR, '视觉识别服务暂时不可用', HttpStatus.SERVICE_UNAVAILABLE)
      }

      const body = await response.json() as QwenChatCompletionResponse
      const content = body.choices?.[0]?.message?.content
      if (!content) {
        throw new BusinessException(ErrorCode.INTERNAL_ERROR, '视觉识别结果为空', HttpStatus.BAD_GATEWAY)
      }

      const usage = this.normalizeUsage(body.usage)

      return {
        provider: this.name,
        model,
        ...this.normalizeResult(content),
        ...usage,
      }
    }
    catch (error) {
      if (error instanceof BusinessException) {
        throw error
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BusinessException(ErrorCode.INTERNAL_ERROR, '视觉识别超时，请稍后重试', HttpStatus.GATEWAY_TIMEOUT)
      }
      throw new BusinessException(ErrorCode.INTERNAL_ERROR, '视觉识别失败，请换一张更清晰的照片', HttpStatus.BAD_GATEWAY)
    }
    finally {
      clearTimeout(timeout)
    }
  }

  private buildPrompt(context: string | undefined, locale: string, sourceType: string) {
    return [
      `locale: ${locale}`,
      `sourceType: ${sourceType}`,
      context ? `context: ${context}` : undefined,
      '请分析图片并判断来源类型：photo, receipt, screenshot, package, unknown。',
      '最多返回 20 个应该加入冰箱库存的 items。对小票和订单截图，优先解析已购买商品行的商品名、规格、数量和单位；不要识别推荐商品、广告、猜你喜欢。对实物照片，只识别清晰可见的食材，不要猜测被遮挡物。对包装照片，优先读取包装商品名。',
      '返回 JSON 格式：{"sourceType":"photo|receipt|screenshot|package|unknown","items":[{"name":"鸡蛋","rawName":"本地鲜鸡蛋15枚","category":"egg_milk","quantity":15,"unit":"枚","freshnessDays":14,"confidence":0.9,"note":"请确认保鲜期"}],"ignored":[{"text":"购物袋","reason":"非食材"}],"warnings":[]}',
      '如果数量或单位无法确定，省略对应字段。保鲜期无法确定时可按常识估计 freshnessDays，但必须在 note 中提示请确认。不要返回 Markdown，只返回 JSON。',
    ].filter(Boolean).join('\n')
  }

  private normalizeResult(content: string): Pick<RecognizeIngredientsResultDto, 'sourceType' | 'items' | 'ignored' | 'warnings'> {
    let raw: RawRecognitionResult
    try {
      raw = JSON.parse(content) as RawRecognitionResult
    }
    catch {
      throw new BusinessException(ErrorCode.INTERNAL_ERROR, '视觉识别结果格式异常', HttpStatus.BAD_GATEWAY)
    }

    const sourceType = this.normalizeSourceType(raw.sourceType)
    const items = Array.isArray(raw.items)
      ? raw.items.map(item => this.normalizeItem(item)).filter((item): item is RecognizedIngredientDto => item !== null).slice(0, 20)
      : []
    const ignored = Array.isArray(raw.ignored)
      ? raw.ignored.map(item => this.normalizeIgnoredItem(item)).filter((item): item is IgnoredRecognitionItemDto => item !== null).slice(0, 10)
      : []
    const warnings = Array.isArray(raw.warnings)
      ? raw.warnings.map(warning => this.toSafeString(warning, 120)).filter((warning): warning is string => Boolean(warning)).slice(0, 5)
      : []

    return { sourceType, items, ignored, warnings }
  }

  private normalizeItem(value: unknown): RecognizedIngredientDto | null {
    if (!value || typeof value !== 'object') {
      return null
    }
    const record = value as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name.trim().slice(0, 40) : ''
    if (!name) {
      return null
    }

    const category = typeof record.category === 'string' ? record.category : 'other'
    const rawName = this.toSafeString(record.rawName, 80)
    const quantity = this.toPositiveNumber(record.quantity)
    const freshnessDays = this.toNonNegativeInteger(record.freshnessDays)
    const confidence = this.toConfidence(record.confidence)
    const unit = this.toSafeString(record.unit, 12)
    const note = this.toSafeString(record.note, 120)

    return {
      name,
      ...(rawName ? { rawName } : {}),
      category: (FOOD_CATEGORIES.has(category) ? category : FoodCategory.other) as FoodCategory,
      ...(quantity === undefined ? {} : { quantity }),
      ...(unit ? { unit } : {}),
      ...(freshnessDays === undefined ? {} : { freshnessDays }),
      ...(confidence === undefined ? {} : { confidence }),
      ...(note ? { note } : {}),
    }
  }

  private normalizeSourceType(value: unknown): RecognizedSourceType {
    return typeof value === 'string' && SOURCE_TYPES.has(value as RecognizedSourceType) ? value as RecognizedSourceType : 'unknown'
  }

  private normalizeIgnoredItem(value: unknown): IgnoredRecognitionItemDto | null {
    if (!value || typeof value !== 'object') {
      return null
    }
    const record = value as Record<string, unknown>
    const text = this.toSafeString(record.text, 80)
    const reason = this.toSafeString(record.reason, 80)
    return text && reason ? { text, reason } : null
  }

  private toSafeString(value: unknown, maxLength: number) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : undefined
  }

  private toPositiveNumber(value: unknown) {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined
  }

  private toNonNegativeInteger(value: unknown) {
    const numberValue = Number(value)
    return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : undefined
  }

  private toConfidence(value: unknown) {
    const numberValue = Number(value)
    if (!Number.isFinite(numberValue)) {
      return undefined
    }
    return Math.max(0, Math.min(1, numberValue))
  }

  /**
   * 把 DashScope 的 usage 对象转成 result DTO 的扁平字段。
   *
   * - 任何非正整数都丢弃（防止 model 返回 "0" 字符串这种边界值)
   * - 三个字段相互独立——拿到 prompt_tokens 但没有 total_tokens 也按部分写入
   * - 完全无 usage 时返回空对象，spread 不影响主结果
   */
  private normalizeUsage(usage: QwenChatCompletionResponse['usage']) {
    if (!usage) {
      return {}
    }
    const inputTokens = this.toNonNegativeInteger(usage.prompt_tokens)
    const outputTokens = this.toNonNegativeInteger(usage.completion_tokens)
    const totalTokens = this.toNonNegativeInteger(usage.total_tokens)
    return {
      ...(inputTokens === undefined ? {} : { inputTokens }),
      ...(outputTokens === undefined ? {} : { outputTokens }),
      ...(totalTokens === undefined ? {} : { totalTokens }),
    }
  }
}
