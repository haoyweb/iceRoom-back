import { registerAs } from '@nestjs/config'

export const visionRecognitionConfig = registerAs('visionRecognition', () => ({
  provider: process.env.VISION_INGREDIENT_PROVIDER ?? 'qwen',
  timeoutMs: Number(process.env.VISION_INGREDIENT_TIMEOUT_MS ?? 20000),
  maxImageBytes: Number(process.env.VISION_INGREDIENT_MAX_IMAGE_BYTES ?? 5242880),
  qwen: {
    apiKey: process.env.QWEN_VISION_API_KEY ?? '',
    baseUrl: process.env.QWEN_VISION_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: process.env.QWEN_VISION_MODEL ?? 'qwen3-vl-flash',
  },
}))
