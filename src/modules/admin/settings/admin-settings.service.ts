import { Injectable } from '@nestjs/common'
import { SettingsService } from '@/modules/settings/settings.service'

@Injectable()
export class AdminSettingsService {
  constructor(private readonly settings: SettingsService) {}

  async getSettings() {
    const registration = await this.settings.getRegistrationSetting()
    return { registration }
  }

  updateRegistration(enabled: boolean) {
    return this.settings.updateRegistrationSetting(enabled)
  }
}
