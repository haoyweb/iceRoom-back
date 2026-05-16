import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { CreateFridgeDto } from './dto/create-fridge.dto'
import { CreateStorageShelfDto } from './dto/create-storage-shelf.dto'
import { UpdateFridgeDto } from './dto/update-fridge.dto'
import { UpdateStorageShelfDto } from './dto/update-storage-shelf.dto'
import { FridgeService } from './fridge.service'

@ApiTags('fridge')
@ApiParam({ name: 'fridgeId', required: false, example: 'fridge_demo', description: '冰箱 ID（出现在 :fridgeId 路径段）' })
@ApiParam({ name: 'shelfId', required: false, example: 'shelf_demo', description: '层位 ID（出现在 :shelfId 路径段）' })
@ApiParam({ name: 'id', required: false, example: 'fridge_demo', description: '冰箱 ID（出现在 :id 路径段）' })
@Controller('fridges')
export class FridgeController {
  constructor(private readonly fridgeService: FridgeService) {}

  @Get()
  @ApiOkResponse({ description: 'List fridges of current user with shelves.' })
  list(@CurrentUser('id') userId: string) {
    return this.fridgeService.list(userId)
  }

  @Post()
  @ApiCreatedResponse({ description: 'Create fridge for current user.' })
  create(@Body() data: CreateFridgeDto, @CurrentUser('id') userId: string) {
    return this.fridgeService.create(data, userId)
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Get fridge detail with shelves.' })
  getById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.fridgeService.getById(id, userId)
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Update fridge.' })
  update(@Param('id') id: string, @Body() data: UpdateFridgeDto, @CurrentUser('id') userId: string) {
    return this.fridgeService.update(id, data, userId)
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Delete fridge.' })
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.fridgeService.remove(id, userId)
  }

  @Get(':fridgeId/shelves')
  @ApiOkResponse({ description: 'List fridge shelves.' })
  listShelves(@Param('fridgeId') fridgeId: string, @CurrentUser('id') userId: string) {
    return this.fridgeService.listShelves(fridgeId, userId)
  }

  @Post(':fridgeId/shelves')
  @ApiCreatedResponse({ description: 'Create fridge shelf.' })
  createShelf(@Param('fridgeId') fridgeId: string, @Body() data: CreateStorageShelfDto, @CurrentUser('id') userId: string) {
    return this.fridgeService.createShelf(fridgeId, data, userId)
  }

  @Post(':fridgeId/shelves/reset-defaults')
  @ApiOkResponse({ description: 'Create missing default shelves for fridge.' })
  resetDefaultShelves(@Param('fridgeId') fridgeId: string, @CurrentUser('id') userId: string) {
    return this.fridgeService.resetDefaultShelves(fridgeId, userId)
  }

  @Get(':fridgeId/shelves/:shelfId')
  @ApiOkResponse({ description: 'Get fridge shelf detail.' })
  getShelf(@Param('fridgeId') fridgeId: string, @Param('shelfId') shelfId: string, @CurrentUser('id') userId: string) {
    return this.fridgeService.getShelf(fridgeId, shelfId, userId)
  }

  @Patch(':fridgeId/shelves/:shelfId')
  @ApiOkResponse({ description: 'Update fridge shelf.' })
  updateShelf(@Param('fridgeId') fridgeId: string, @Param('shelfId') shelfId: string, @Body() data: UpdateStorageShelfDto, @CurrentUser('id') userId: string) {
    return this.fridgeService.updateShelf(fridgeId, shelfId, data, userId)
  }

  @Delete(':fridgeId/shelves/:shelfId')
  @ApiOkResponse({ description: 'Delete fridge shelf.' })
  removeShelf(@Param('fridgeId') fridgeId: string, @Param('shelfId') shelfId: string, @CurrentUser('id') userId: string) {
    return this.fridgeService.removeShelf(fridgeId, shelfId, userId)
  }
}
