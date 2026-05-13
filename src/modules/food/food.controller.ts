import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
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
  @ApiOkResponse({ description: 'List food inventory.' })
  list(@Query() query: FoodQueryDto) {
    return this.foodService.list(query)
  }

  @Get('expiring')
  @ApiOkResponse({ description: 'List expiring foods by configurable days.' })
  listExpiring(@Query() query: ExpiringFoodQueryDto) {
    return this.foodService.listExpiring(query)
  }

  @Post()
  @ApiCreatedResponse({ description: 'Create food item.' })
  create(@Body() data: CreateFoodDto) {
    return this.foodService.create(data)
  }

  @Post('consume-batch')
  @ApiOkResponse({ description: 'Consume multiple food items after cooking.' })
  consumeBatch(@Body() data: ConsumeFoodBatchDto) {
    return this.foodService.consumeBatch(data)
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Get food detail.' })
  getById(@Param('id') id: string) {
    return this.foodService.getById(id)
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Update food item.' })
  update(@Param('id') id: string, @Body() data: UpdateFoodDto) {
    return this.foodService.update(id, data)
  }

  @Patch(':id/status')
  @ApiOkResponse({ description: 'Update food status.' })
  updateStatus(@Param('id') id: string, @Body() data: UpdateFoodStatusDto) {
    return this.foodService.updateStatus(id, data)
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Delete food item.' })
  remove(@Param('id') id: string) {
    return this.foodService.remove(id)
  }
}
