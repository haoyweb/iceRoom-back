import { registerAs } from '@nestjs/config'

export const visionRecognitionConfig = registerAs('visionRecognition', () => ({
  provider: process.env.VISION_INGREDIENT_PROVIDER ?? 'qwen',
  timeoutMs: Number(process.env.VISION_INGREDIENT_TIMEOUT_MS ?? 20000),
  maxImageBytes: Number(process.env.VISION_INGREDIENT_MAX_IMAGE_BYTES ?? 5242880),
  qwen: {
    apiKey: process.env.QWEN_VISION_API_KEY ?? '',
    baseUrl: process.env.QWEN_VISION_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: process.env.QWEN_VISION_MODEL ?? 'qwen3-vl-flash',
    // USD 单价（每 1000 tokens）。未配置或 0 视为「不可计算」，service 会写 costUSD = null。
    // 例：qwen3-vl-flash 公开费率 input $0.00015/1K + output $0.00045/1K
    inputUsdPer1k: Number(process.env.VISION_QWEN_INPUT_USD_PER_1K ?? 0),
    outputUsdPer1k: Number(process.env.VISION_QWEN_OUTPUT_USD_PER_1K ?? 0),
  },
}))
