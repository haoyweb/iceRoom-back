import { Controller, Get, Query } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { TodayActionQueryDto } from './dto/today-action-query.dto'
import { TodayActionDto } from './dto/today-action.dto'
import { HomeService } from './home.service'

/**
 * 首页摘要边界。当前只承载「今日处理建议」一个端点，
 * 未来如要承接「冰箱概览」「层位健康度」等聚合视图，都收敛到同一 module 下。
 */
@ApiTags('home')
@Controller('home')
export class HomeController {
  constructor(private readonly service: HomeService) {}

  @Get('today')
  @ApiOkResponse({ type: TodayActionDto, description: 'Aggregated today action summary for a fridge.' })
  today(@Query() query: TodayActionQueryDto, @CurrentUser('id') userId: string): Promise<TodayActionDto> {
    return this.service.getToday(query.fridgeId, userId)
  }
}
