import type { RecognizeIngredientsResultDto } from '../dto/recognized-ingredient.dto'

export interface VisionIngredientProviderInput {
  imageBuffer: Buffer
  mimeType: string
  context?: string
  locale: string
  sourceType: string
}

export interface VisionIngredientProvider {
  readonly name: string
  recognizeIngredients(input: VisionIngredientProviderInput): Promise<RecognizeIngredientsResultDto>
}
