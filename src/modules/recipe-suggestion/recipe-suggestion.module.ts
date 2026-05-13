import { Module } from '@nestjs/common'
import { RecipeSuggestionController } from './recipe-suggestion.controller'
import { RecipeSuggestionService } from './recipe-suggestion.service'

@Module({
  controllers: [RecipeSuggestionController],
  providers: [RecipeSuggestionService],
})
export class RecipeSuggestionModule {}
