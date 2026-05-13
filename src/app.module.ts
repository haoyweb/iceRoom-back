import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './modules/auth/auth.module'
import { FoodModule } from './modules/food/food.module'
import { FridgeModule } from './modules/fridge/fridge.module'
import { HealthModule } from './modules/health/health.module'
import { RecipeSuggestionModule } from './modules/recipe-suggestion/recipe-suggestion.module'
import { UserModule } from './modules/user/user.module'
import { appConfig } from './config/app.config'
import { databaseConfig } from './config/database.config'
import { envValidationSchema } from './config/env.validation'
import { DatabaseModule } from './database/database.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig],
      validationSchema: envValidationSchema,
      expandVariables: true,
    }),
    DatabaseModule,
    HealthModule,
    UserModule,
    AuthModule,
    FridgeModule,
    FoodModule,
    RecipeSuggestionModule,
  ],
})
export class AppModule {}
