import { Module } from '@nestjs/common'
import { SettingsModule } from '@/modules/settings/settings.module'
import { AppConfigController } from './app-config.controller'
import { AppConfigService } from './app-config.service'

@Module({
  imports: [SettingsModule],
  controllers: [AppConfigController],
  providers: [AppConfigService],
})
export class AppConfigModule {}
