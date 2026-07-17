import { Injectable } from '@nestjs/common'
import { SettingsService } from '@/modules/settings/settings.service'

@Injectable()
export class AdminSettingsService {
  constructor(private readonly settings: SettingsService) {}

  async getSettings() {
    const [registration, visionRecognition] = await Promise.all([
      this.settings.getRegistrationSetting(),
      this.settings.getVisionRecognitionSetting(),
    ])
    return { registration, visionRecognition }
  }

  updateRegistration(enabled: boolean) {
    return this.settings.updateRegistrationSetting(enabled)
  }

  updateVisionRecognition(enabled: boolean) {
    return this.settings.updateVisionRecognitionSetting(enabled)
  }
}
