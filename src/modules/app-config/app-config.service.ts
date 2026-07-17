import { Injectable } from '@nestjs/common'
import { SettingsService } from '@/modules/settings/settings.service'

@Injectable()
export class AppConfigService {
  constructor(private readonly settings: SettingsService) {}

  async getClientConfig() {
    const visionRecognition = await this.settings.getVisionRecognitionSetting()

    return {
      features: {
        ingredientRecognitionEnabled: visionRecognition.enabled,
      },
      updatedAt: new Date().toISOString(),
    }
  }
}
