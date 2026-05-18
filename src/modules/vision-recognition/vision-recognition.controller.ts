import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { RecognizeIngredientsDto } from './dto/recognize-ingredients.dto'
import { RecognizeIngredientsResultDto } from './dto/recognized-ingredient.dto'
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
  @ApiCreatedResponse({ type: RecognizeIngredientsResultDto, description: 'Recognize ingredient drafts from an uploaded photo.' })
  @UseInterceptors(FileInterceptor('image'))
  recognizeIngredients(
    @UploadedFile() image: UploadedImageFile | undefined,
    @Body() data: RecognizeIngredientsDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.visionRecognitionService.recognizeIngredients(image, data, userId)
  }
}
