import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger'
import { RecipeSuggestionByFridgeDto } from './dto/recipe-suggestion-by-fridge.dto'
import { RecipeSuggestionQueryDto } from './dto/recipe-suggestion-query.dto'
import { RecipeSuggestionService } from './recipe-suggestion.service'

@ApiTags('recipe-suggestion')
@Controller('recipe-suggestions')
export class RecipeSuggestionController {
  constructor(private readonly recipeSuggestionService: RecipeSuggestionService) {}

  @Post()
  @ApiOkResponse({ description: 'Suggest recipes by available ingredients.' })
  suggest(@Body() data: RecipeSuggestionQueryDto) {
    return this.recipeSuggestionService.suggest(data.ingredients)
  }

  @Get('by-fridge')
  @ApiOkResponse({ description: 'Suggest recipes by normal foods in a fridge.' })
  suggestByFridge(@Query() query: RecipeSuggestionByFridgeDto) {
    return this.recipeSuggestionService.suggestByFridge(query.fridgeId, query.limit)
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Recipe rule ID' })
  @ApiOkResponse({ description: 'Get full recipe detail including instructions/tips/image.' })
  findOne(@Param('id') id: string) {
    return this.recipeSuggestionService.findById(id)
  }
}
