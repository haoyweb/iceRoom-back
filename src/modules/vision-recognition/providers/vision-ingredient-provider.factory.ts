import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { QwenVisionIngredientProvider } from './qwen-vision-ingredient.provider'
import type { VisionIngredientProvider } from './vision-ingredient-provider.interface'

@Injectable()
export class VisionIngredientProviderFactory {
  constructor(
    private readonly configService: ConfigService,
    private readonly qwenProvider: QwenVisionIngredientProvider,
  ) {}

  getProvider(): VisionIngredientProvider {
    const provider = this.configService.get<string>('visionRecognition.provider') ?? 'qwen'

    switch (provider) {
      case 'qwen':
        return this.qwenProvider
      default:
        return this.qwenProvider
    }
  }
}
