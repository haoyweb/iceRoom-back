import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { RecognizeIngredientsDto } from './dto/recognize-ingredients.dto'
import { CreateIngredientRecognitionJobResultDto, IngredientRecognitionJobDetailDto } from './dto/vision-recognition-job.dto'
import { VisionRecognitionJobQueryDto } from './dto/vision-recognition-job-query.dto'
import type { UploadedImageFile } from './vision-recognition.types'
import { VisionRecognitionService } from './vision-recognition.service'

@ApiTags('vision-recognition')
@Controller('vision-recognitions')
export class VisionRecognitionController {
  constructor(private readonly visionRecognitionService: VisionRecognitionService) {}

  @Post('ingredients')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: {
        image: { type: 'string', format: 'binary' },
        fridgeId: { type: 'string' },
        shelfId: { type: 'string' },
        context: { type: 'string' },
        locale: { type: 'string', default: 'zh-CN' },
        sourceType: { type: 'string', enum: ['auto', 'photo', 'receipt', 'screenshot', 'package'], default: 'auto' },
      },
    },
  })
  @ApiCreatedResponse({ type: CreateIngredientRecognitionJobResultDto, description: 'Create an async ingredient recognition job.' })
  @UseInterceptors(FileInterceptor('image'))
  createIngredientRecognitionJob(
    @UploadedFile() image: UploadedImageFile | undefined,
    @Body() data: RecognizeIngredientsDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.visionRecognitionService.createIngredientJob(image, data, userId)
  }

  @Get('ingredients')
  listIngredientRecognitionJobs(
    @Query() query: VisionRecognitionJobQueryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.visionRecognitionService.listIngredientJobs(query, userId)
  }

  @Get('ingredients/:id')
  @ApiOkResponse({ type: IngredientRecognitionJobDetailDto })
  getIngredientRecognitionJob(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.visionRecognitionService.getIngredientJob(id, userId)
  }

  @Patch('ingredients/:id/confirmed')
  @ApiOkResponse({ type: IngredientRecognitionJobDetailDto })
  markIngredientRecognitionConfirmed(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.visionRecognitionService.markIngredientJobConfirmed(id, userId)
  }

  @Delete('ingredients/:id')
  deleteIngredientRecognitionJob(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.visionRecognitionService.deleteIngredientJob(id, userId)
  }
}
