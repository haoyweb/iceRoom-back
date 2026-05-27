import { Module } from '@nestjs/common'
import { FridgeModule } from '../fridge/fridge.module'
import { FoodReminderController } from './food-reminder.controller'
import { FoodReminderService } from './food-reminder.service'
import { FoodController } from './food.controller'
import { FoodService } from './food.service'

@Module({
  // FridgeModule 提供 FridgeService（已 exports），用于在 food 操作前校验 fridge 归属。
  imports: [FridgeModule],
  controllers: [FoodController, FoodReminderController],
  providers: [FoodService, FoodReminderService],
  // exports FoodService 让 FoodReminderService 注入复用 ensureFoodExistsForUser；
  // 未来如有其他模块需要 food 操作能力也可直接消费。
  exports: [FoodService],
})
export class FoodModule {}

