import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger'
import { CreateFridgeDto } from './dto/create-fridge.dto'
import { CreateStorageShelfDto } from './dto/create-storage-shelf.dto'
import { UpdateFridgeDto } from './dto/update-fridge.dto'
import { UpdateStorageShelfDto } from './dto/update-storage-shelf.dto'
import { FridgeService } from './fridge.service'

@ApiTags('fridge')
@Controller('fridges')
export class FridgeController {
  constructor(private readonly fridgeService: FridgeService) {}

  @Get()
  @ApiQuery({ name: 'userId', required: false })
  @ApiOkResponse({ description: 'List fridges with shelves.' })
  list(@Query('userId') userId?: string) {
    return this.fridgeService.list(userId)
  }

  @Post()
  @ApiCreatedResponse({ description: 'Create fridge.' })
  create(@Body() data: CreateFridgeDto) {
    return this.fridgeService.create(data)
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Get fridge detail with shelves.' })
  getById(@Param('id') id: string) {
    return this.fridgeService.getById(id)
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Update fridge.' })
  update(@Param('id') id: string, @Body() data: UpdateFridgeDto) {
    return this.fridgeService.update(id, data)
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Delete fridge.' })
  remove(@Param('id') id: string) {
    return this.fridgeService.remove(id)
  }

  @Get(':fridgeId/shelves')
  @ApiOkResponse({ description: 'List fridge shelves.' })
  listShelves(@Param('fridgeId') fridgeId: string) {
    return this.fridgeService.listShelves(fridgeId)
  }

  @Post(':fridgeId/shelves')
  @ApiCreatedResponse({ description: 'Create fridge shelf.' })
  createShelf(@Param('fridgeId') fridgeId: string, @Body() data: CreateStorageShelfDto) {
    return this.fridgeService.createShelf(fridgeId, data)
  }

  @Post(':fridgeId/shelves/reset-defaults')
  @ApiOkResponse({ description: 'Create missing default shelves for fridge.' })
  resetDefaultShelves(@Param('fridgeId') fridgeId: string) {
    return this.fridgeService.resetDefaultShelves(fridgeId)
  }

  @Get(':fridgeId/shelves/:shelfId')
  @ApiOkResponse({ description: 'Get fridge shelf detail.' })
  getShelf(@Param('fridgeId') fridgeId: string, @Param('shelfId') shelfId: string) {
    return this.fridgeService.getShelf(fridgeId, shelfId)
  }

  @Patch(':fridgeId/shelves/:shelfId')
  @ApiOkResponse({ description: 'Update fridge shelf.' })
  updateShelf(@Param('fridgeId') fridgeId: string, @Param('shelfId') shelfId: string, @Body() data: UpdateStorageShelfDto) {
    return this.fridgeService.updateShelf(fridgeId, shelfId, data)
  }

  @Delete(':fridgeId/shelves/:shelfId')
  @ApiOkResponse({ description: 'Delete fridge shelf.' })
  removeShelf(@Param('fridgeId') fridgeId: string, @Param('shelfId') shelfId: string) {
    return this.fridgeService.removeShelf(fridgeId, shelfId)
  }
}
