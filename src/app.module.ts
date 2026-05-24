import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler'
import { AdminModule } from './modules/admin/admin.module'
import { AuthModule } from './modules/auth/auth.module'
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard'
import { FoodModule } from './modules/food/food.module'
import { FridgeModule } from './modules/fridge/fridge.module'
import { HealthModule } from './modules/health/health.module'
import { RecipeSuggestionModule } from './modules/recipe-suggestion/recipe-suggestion.module'
import { SettingsModule } from './modules/settings/settings.module'
import { StorageModule } from './modules/storage/storage.module'
import { UserModule } from './modules/user/user.module'
import { VisionRecognitionModule } from './modules/vision-recognition/vision-recognition.module'
import { appConfig } from './config/app.config'
import { authConfig } from './config/auth.config'
import { databaseConfig } from './config/database.config'
import { storageConfig } from './config/storage.config'
import { visionRecognitionConfig } from './config/vision-recognition.config'
import { envValidationSchema } from './config/env.validation'
import { DatabaseModule } from './database/database.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, authConfig, databaseConfig, storageConfig, visionRecognitionConfig],
      validationSchema: envValidationSchema,
      expandVariables: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: seconds(60),
        limit: 120,
      },
    ]),
    DatabaseModule,
    StorageModule,
    SettingsModule,
    HealthModule,
    UserModule,
    AuthModule,
    FridgeModule,
    FoodModule,
    RecipeSuggestionModule,
    VisionRecognitionModule,
    AdminModule,
  ],
  // 全局 JwtAuthGuard：默认所有接口都要登录，要免登录的接口显式 @Public()。
  // 这是「白名单短、黑名单长」场景下的安全默认——避免漏挂守卫导致接口裸奔。
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}



