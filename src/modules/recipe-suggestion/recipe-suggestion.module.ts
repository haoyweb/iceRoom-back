import { Module } from '@nestjs/common'
import { FridgeModule } from '../fridge/fridge.module'
import { RecipeSuggestionController } from './recipe-suggestion.controller'
import { RecipeSuggestionService } from './recipe-suggestion.service'

@Module({
  // FridgeModule 为 suggestByFridge 提供 ownership 校验
  imports: [FridgeModule],
  controllers: [RecipeSuggestionController],
  providers: [RecipeSuggestionService],
  // exports 让 HomeModule 等聚合层模块能复用 suggestByFridge，避免重复实现菜谱评分/排序逻辑
  exports: [RecipeSuggestionService],
})
export class RecipeSuggestionModule {}

