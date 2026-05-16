import { Module } from '@nestjs/common'
import { FridgeModule } from '../fridge/fridge.module'
import { RecipeSuggestionController } from './recipe-suggestion.controller'
import { RecipeSuggestionService } from './recipe-suggestion.service'

@Module({
  // FridgeModule 为 suggestByFridge 提供 ownership 校验
  imports: [FridgeModule],
  controllers: [RecipeSuggestionController],
  providers: [RecipeSuggestionService],
})
export class RecipeSuggestionModule {}

