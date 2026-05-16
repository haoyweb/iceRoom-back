import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { FridgeService } from '../fridge/fridge.service'
import { RecipeListQueryDto } from './dto/recipe-list-query.dto'
import { RecipeSuggestionByFridgeDto } from './dto/recipe-suggestion-by-fridge.dto'
import { RecipeSuggestionQueryDto } from './dto/recipe-suggestion-query.dto'
import { RecipeSuggestionService } from './recipe-suggestion.service'

/**
 * 菜谱接口对所有已登录用户开放（菜谱本身不属于用户，是全局共享数据）。
 * suggestByFridge 多一层 fridge ownership 校验——不能用别人的冰箱 ID 反推他人食材。
 */
@ApiTags('recipe-suggestion')
@Controller('recipe-suggestions')
export class RecipeSuggestionController {
  constructor(
    private readonly recipeSuggestionService: RecipeSuggestionService,
    private readonly fridgeService: FridgeService,
  ) {}

  @Get()
  @ApiOkResponse({ description: 'Paginated recipe list with filters (category/difficulty/keyword) and sort.' })
  list(@Query() query: RecipeListQueryDto) {
    return this.recipeSuggestionService.list(query)
  }

  @Post()
  @ApiOkResponse({ description: 'Suggest recipes by available ingredients.' })
  suggest(@Body() data: RecipeSuggestionQueryDto) {
    return this.recipeSuggestionService.suggest(data.ingredients)
  }

  @Get('by-fridge')
  @ApiOkResponse({ description: 'Suggest recipes by normal foods in a fridge (must own the fridge).' })
  async suggestByFridge(@Query() query: RecipeSuggestionByFridgeDto, @CurrentUser('id') userId: string) {
    await this.fridgeService.ensureFridgeOwnedByUser(query.fridgeId, userId)
    return this.recipeSuggestionService.suggestByFridge(query.fridgeId, query.limit)
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Recipe rule ID' })
  @ApiOkResponse({ description: 'Get full recipe detail including instructions/tips/image/portions/stepImages.' })
  findOne(@Param('id') id: string) {
    return this.recipeSuggestionService.findById(id)
  }
}

