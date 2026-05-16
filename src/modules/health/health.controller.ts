import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '@/common/decorators/public.decorator'
import { HealthService } from './health.service'

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({ description: 'Service and database health check.' })
  check() {
    return this.healthService.check()
  }
}

