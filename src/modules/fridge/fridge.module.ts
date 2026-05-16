import { Module } from '@nestjs/common'
import { FridgeController } from './fridge.controller'
import { FridgeService } from './fridge.service'

@Module({
  controllers: [FridgeController],
  providers: [FridgeService],
  // exports：FoodModule 与 RecipeSuggestionModule 都要用 ensureFridgeOwnedByUser 做权限校验
  exports: [FridgeService],
})
export class FridgeModule {}

