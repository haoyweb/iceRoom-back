import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { AdminGuard } from '../guards/admin.guard'
import { RolesGuard } from '../guards/roles.guard'
import { AdminRecipesService } from './admin-recipes.service'
import { ListRecipesQueryDto } from './dto/list-recipes.query.dto'
import { CreateRecipeDto, UpdateRecipeDto } from './dto/upsert-recipe.dto'

@ApiTags('admin-recipes')
@UseGuards(AdminGuard, RolesGuard)
@Controller('admin/recipes')
export class AdminRecipesController {
  constructor(private readonly service: AdminRecipesService) {}

  @Get()
  @ApiOkResponse({ description: '菜谱列表（分页 + 关键字/分类/难度/来源筛选）' })
  list(@Query() query: ListRecipesQueryDto) {
    return this.service.list(query)
  }

  @Get(':id')
  @ApiOkResponse({ description: '菜谱详情' })
  getById(@Param('id') id: string) {
    return this.service.getById(id)
  }

  @Post()
  @ApiCreatedResponse({ description: '新建菜谱' })
  create(@Body() dto: CreateRecipeDto) {
    return this.service.create(dto)
  }

  @Patch(':id')
  @ApiOkResponse({ description: '更新菜谱（partial）' })
  update(@Param('id') id: string, @Body() dto: UpdateRecipeDto) {
    return this.service.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: '删除菜谱' })
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}
