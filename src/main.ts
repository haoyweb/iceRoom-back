import { ValidationPipe, VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { API_PREFIX, API_VERSION } from './common/constants/app.constants'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const configService = app.get(ConfigService)
  const port = configService.get<number>('app.port', 3000)
  const corsOrigin = configService.get<string[]>('app.corsOrigin', ['*'])
  const swaggerEnabled = configService.get<boolean>('app.swaggerEnabled', true)

  app.setGlobalPrefix(API_PREFIX)
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: API_VERSION,
  })
  // 单 `*` 走 origin: true（放开所有），多 origin 走精确白名单——避免 `*` + credentials 在浏览器侧被拒
  const isWildcard = corsOrigin.length === 1 && corsOrigin[0] === '*'
  app.enableCors({
    origin: isWildcard ? true : corsOrigin,
    credentials: !isWildcard,
  })
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )
  app.useGlobalFilters(new HttpExceptionFilter())
  app.useGlobalInterceptors(new ResponseInterceptor())

  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('hy-iceRoom API')
      .setDescription('Backend API for fridge food expiry reminders and recipe suggestions.')
      .setVersion(API_VERSION)
      .build()
    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, document)
  }

  await app.listen(port, '0.0.0.0')
}

void bootstrap()
