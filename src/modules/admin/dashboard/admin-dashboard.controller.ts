import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { AdminGuard } from '../guards/admin.guard'
import { RolesGuard } from '../guards/roles.guard'
import { AdminDashboardService } from './admin-dashboard.service'
import { DashboardTrendQueryDto } from './dto/dashboard-query.dto'

@ApiTags('admin-dashboard')
@UseGuards(AdminGuard, RolesGuard)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly service: AdminDashboardService) {}

  @Get('overview')
  @ApiOkResponse({ description: '看板顶部指标卡（用户数、活跃数、食材数、识别数、今日/累计成本）' })
  overview() {
    return this.service.overview()
  }

  @Get('user-trend')
  @ApiOkResponse({ description: '用户增长 / 活跃趋势（按日聚合）' })
  userTrend(@Query() query: DashboardTrendQueryDto) {
    return this.service.userTrend(query.days ?? 7)
  }

  @Get('food-trend')
  @ApiOkResponse({ description: '食材入库趋势（按日聚合）' })
  foodTrend(@Query() query: DashboardTrendQueryDto) {
    return this.service.foodTrend(query.days ?? 7)
  }

  @Get('vision-trend')
  @ApiOkResponse({ description: '识别量与成本趋势（按日聚合，双 y 轴使用）' })
  visionTrend(@Query() query: DashboardTrendQueryDto) {
    return this.service.visionTrend(query.days ?? 7)
  }
}
