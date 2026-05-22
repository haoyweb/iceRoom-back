import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { AdminGuard } from '../guards/admin.guard'
import { RolesGuard } from '../guards/roles.guard'
import { AdminVisionJobsService } from './admin-vision-jobs.service'
import { ListVisionJobsQueryDto, VisionJobsStatsQueryDto } from './dto/list-jobs.query.dto'

@ApiTags('admin-vision-jobs')
@UseGuards(AdminGuard, RolesGuard)
@Controller('admin/vision-jobs')
export class AdminVisionJobsController {
  constructor(private readonly service: AdminVisionJobsService) {}

  @Get()
  @ApiOkResponse({ description: '跨用户识别任务列表' })
  list(@Query() query: ListVisionJobsQueryDto) {
    return this.service.list(query)
  }

  // stats 必须在 :id 之前——否则 'stats' 会被当作 id 走详情路由
  @Get('stats')
  @ApiOkResponse({ description: '识别任务聚合统计' })
  stats(@Query() query: VisionJobsStatsQueryDto) {
    return this.service.stats(query)
  }

  @Get(':id')
  @ApiOkResponse({ description: '识别任务详情（含用户信息）' })
  getById(@Param('id') id: string) {
    return this.service.getById(id)
  }
}
