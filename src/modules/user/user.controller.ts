import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { UserService } from './user.service'

@ApiTags('user')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOkResponse({ description: 'List users.' })
  list() {
    return this.userService.list()
  }

  @Post()
  @ApiCreatedResponse({ description: 'Create user.' })
  create(@Body() data: CreateUserDto) {
    return this.userService.create(data)
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Get user detail.' })
  getById(@Param('id') id: string) {
    return this.userService.getById(id)
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Update user.' })
  update(@Param('id') id: string, @Body() data: UpdateUserDto) {
    return this.userService.update(id, data)
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Delete user.' })
  remove(@Param('id') id: string) {
    return this.userService.remove(id)
  }
}
