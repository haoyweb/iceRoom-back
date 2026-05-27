import { Module } from '@nestjs/common'
import { FoodModule } from '../food/food.module'
import { FridgeModule } from '../fridge/fridge.module'
import { RecipeSuggestionModule } from '../recipe-suggestion/recipe-suggestion.module'
import { HomeController } from './home.controller'
import { HomeService } from './home.service'

@Module({
  imports: [FridgeModule, FoodModule, RecipeSuggestionModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
