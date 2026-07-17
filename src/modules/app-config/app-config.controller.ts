import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { Public } from '@/common/decorators/public.decorator'
import { AppConfigService } from './app-config.service'

@ApiTags('app-config')
@Public()
@Controller('app/config')
export class AppConfigController {
  constructor(private readonly service: AppConfigService) {}

  @Get()
  @ApiOkResponse({ description: 'C 端运行时配置' })
  getClientConfig() {
    return this.service.getClientConfig()
  }
}
