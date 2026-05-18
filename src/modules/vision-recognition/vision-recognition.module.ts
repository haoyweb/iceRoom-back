import { Module } from '@nestjs/common'
import { FridgeModule } from '@/modules/fridge/fridge.module'
import { QwenVisionIngredientProvider } from './providers/qwen-vision-ingredient.provider'
import { VisionIngredientProviderFactory } from './providers/vision-ingredient-provider.factory'
import { VisionRecognitionController } from './vision-recognition.controller'
import { VisionRecognitionService } from './vision-recognition.service'

@Module({
  imports: [FridgeModule],
  controllers: [VisionRecognitionController],
  providers: [VisionRecognitionService, QwenVisionIngredientProvider, VisionIngredientProviderFactory],
})
export class VisionRecognitionModule {}
