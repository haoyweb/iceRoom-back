import { Body, Controller, Delete, Param, Post } from '@nestjs/common'
import { ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { SnoozeFoodReminderDto } from './dto/snooze-food-reminder.dto'
import { FoodReminderService } from './food-reminder.service'

/**
 * 食材提醒偏好 HTTP 边界。路由前缀 /foods/:id/remind/* 是因为业务上「提醒」紧贴具体食材，
 * 而不是独立的 /reminders/:id 资源——前端调用语义「对这件食材的提醒做什么」更清晰。
 */
@ApiTags('food-reminder')
@Controller('foods/:id/remind')
export class FoodReminderController {
  constructor(private readonly service: FoodReminderService) {}

  @Post('ignore')
  @ApiParam({ name: 'id', description: 'Food item ID' })
  @ApiOkResponse({ description: 'Permanently ignore reminder for a food item (idempotent upsert).' })
  ignore(@Param('id') foodId: string, @CurrentUser('id') userId: string) {
    return this.service.ignore(foodId, userId)
  }

  @Post('snooze')
  @ApiParam({ name: 'id', description: 'Food item ID' })
  @ApiOkResponse({ description: 'Snooze reminder for a food item for N hours (idempotent upsert).' })
  snooze(@Param('id') foodId: string, @Body() data: SnoozeFoodReminderDto, @CurrentUser('id') userId: string) {
    return this.service.snooze(foodId, userId, data.snoozeHours)
  }

  @Delete()
  @ApiParam({ name: 'id', description: 'Food item ID' })
  @ApiOkResponse({ description: 'Cancel ignore/snooze and restore reminder (idempotent delete).' })
  restore(@Param('id') foodId: string, @CurrentUser('id') userId: string) {
    return this.service.restore(foodId, userId)
  }
}
