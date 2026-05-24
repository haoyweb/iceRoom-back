import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '@/database/prisma.service'

const REGISTRATION_KEY = 'registration'

export interface RegistrationSettingValue {
  enabled: boolean
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRegistrationSetting(): Promise<RegistrationSettingValue> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: REGISTRATION_KEY } })
    if (!row)
      return { enabled: true }

    return this.parseRegistrationValue(row.value)
  }

  async isRegistrationEnabled(): Promise<boolean> {
    const setting = await this.getRegistrationSetting()
    return setting.enabled
  }

  async updateRegistrationSetting(enabled: boolean): Promise<RegistrationSettingValue> {
    const value: Prisma.InputJsonValue = { enabled }
    const row = await this.prisma.appSetting.upsert({
      where: { key: REGISTRATION_KEY },
      create: { key: REGISTRATION_KEY, value },
      update: { value },
    })
    return this.parseRegistrationValue(row.value)
  }

  private parseRegistrationValue(value: Prisma.JsonValue): RegistrationSettingValue {
    if (value && typeof value === 'object' && !Array.isArray(value) && 'enabled' in value) {
      const enabled = (value as { enabled?: unknown }).enabled
      if (typeof enabled === 'boolean')
        return { enabled }
    }
    return { enabled: true }
  }
}
