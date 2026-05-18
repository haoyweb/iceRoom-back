import { HttpStatus, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FridgeService } from '@/modules/fridge/fridge.service'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import type { RecognizeIngredientsDto } from './dto/recognize-ingredients.dto'
import type { RecognizeIngredientsResultDto } from './dto/recognized-ingredient.dto'
import type { UploadedImageFile } from './vision-recognition.types'
import { VisionIngredientProviderFactory } from './providers/vision-ingredient-provider.factory'

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

@Injectable()
export class VisionRecognitionService {
  constructor(
    private readonly configService: ConfigService,
    private readonly fridgeService: FridgeService,
    private readonly providerFactory: VisionIngredientProviderFactory,
  ) {}

  async recognizeIngredients(file: UploadedImageFile | undefined, data: RecognizeIngredientsDto, userId: string): Promise<RecognizeIngredientsResultDto> {
    this.validateImage(file)

    if (data.shelfId && !data.fridgeId) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '选择层位时必须同时指定冰箱', HttpStatus.BAD_REQUEST)
    }

    if (data.fridgeId) {
      await this.fridgeService.ensureFridgeOwnedByUser(data.fridgeId, userId)
      if (data.shelfId) {
        await this.fridgeService.ensureShelfBelongsToFridge(data.fridgeId, data.shelfId)
      }
    }

    return this.providerFactory.getProvider().recognizeIngredients({
      imageBuffer: file!.buffer,
      mimeType: file!.mimetype,
      context: data.context,
      locale: data.locale ?? 'zh-CN',
      sourceType: data.sourceType ?? 'auto',
    })
  }

  private validateImage(file: UploadedImageFile | undefined) {
    if (!file) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请上传食材照片', HttpStatus.BAD_REQUEST)
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '仅支持 JPG、PNG 或 WebP 图片', HttpStatus.BAD_REQUEST)
    }

    const maxImageBytes = this.configService.get<number>('visionRecognition.maxImageBytes') ?? 5242880
    if (file.size > maxImageBytes) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '图片过大，请选择更小的图片', HttpStatus.BAD_REQUEST)
    }
  }
}
