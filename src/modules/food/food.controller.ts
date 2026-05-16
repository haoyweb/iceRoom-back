import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { ConsumeFoodBatchDto } from './dto/consume-food-batch.dto'
import { CreateFoodDto } from './dto/create-food.dto'
import { ExpiringFoodQueryDto } from './dto/expiring-food-query.dto'
import { FoodQueryDto } from './dto/food-query.dto'
import { UpdateFoodStatusDto } from './dto/update-food-status.dto'
import { UpdateFoodDto } from './dto/update-food.dto'
import { FoodService } from './food.service'

@ApiTags('food')
@Controller('foods')
export class FoodController {
  constructor(private readonly foodService: FoodService) {}

  @Get()
  @ApiOkResponse({ description: 'List food inventory for current user.' })
  list(@Query() query: FoodQueryDto, @CurrentUser('id') userId: string) {
    return this.foodService.list(query, userId)
  }

  @Get('expiring')
  @ApiOkResponse({ description: 'List expiring foods of current user by configurable days.' })
  listExpiring(@Query() query: ExpiringFoodQueryDto, @CurrentUser('id') userId: string) {
    return this.foodService.listExpiring(query, userId)
  }

  @Post()
  @ApiCreatedResponse({ description: 'Create food item.' })
  create(@Body() data: CreateFoodDto, @CurrentUser('id') userId: string) {
    return this.foodService.create(data, userId)
  }

  @Post('consume-batch')
  @ApiOkResponse({ description: 'Consume multiple food items after cooking.' })
  consumeBatch(@Body() data: ConsumeFoodBatchDto, @CurrentUser('id') userId: string) {
    return this.foodService.consumeBatch(data, userId)
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Get food detail.' })
  getById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.foodService.getById(id, userId)
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Update food item.' })
  update(@Param('id') id: string, @Body() data: UpdateFoodDto, @CurrentUser('id') userId: string) {
    return this.foodService.update(id, data, userId)
  }

  @Patch(':id/status')
  @ApiOkResponse({ description: 'Update food status.' })
  updateStatus(@Param('id') id: string, @Body() data: UpdateFoodStatusDto, @CurrentUser('id') userId: string) {
    return this.foodService.updateStatus(id, data, userId)
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Delete food item.' })
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.foodService.remove(id, userId)
  }
}
