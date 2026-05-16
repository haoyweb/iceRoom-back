import { Module } from '@nestjs/common'
import { FridgeModule } from '../fridge/fridge.module'
import { FoodController } from './food.controller'
import { FoodService } from './food.service'

@Module({
  // FridgeModule 提供 FridgeService（已 exports），用于在 food 操作前校验 fridge 归属。
  imports: [FridgeModule],
  controllers: [FoodController],
  providers: [FoodService],
})
export class FoodModule {}

