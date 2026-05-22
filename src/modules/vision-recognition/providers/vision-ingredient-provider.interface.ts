import type { RecognizeIngredientsResultDto } from '../dto/recognized-ingredient.dto'

export interface VisionIngredientProviderInput {
  imageBuffer: Buffer
  mimeType: string
  context?: string
  locale: string
  sourceType: string
}

/**
 * Provider 返回的用量信息。
 *
 * 字段对齐 OpenAI 风格 usage 对象（promp/completion/total tokens），
 * Qwen DashScope 兼容协议返回的也是同样命名；前端字段统一用 input/output/total。
 * Provider 拿不到时全部留 undefined，service 层会把对应 DB 字段写 null。
 */
export interface VisionIngredientProviderUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export interface VisionIngredientProvider {
  readonly name: string
  recognizeIngredients(input: VisionIngredientProviderInput): Promise<RecognizeIngredientsResultDto>
}
