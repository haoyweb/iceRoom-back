import { ApiPropertyOptional } from '@nestjs/swagger'
import { VisionRecognitionStatus } from '@prisma/client'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { PageQueryDto } from '@/common/dto/page.dto'

export class VisionRecognitionJobQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: VisionRecognitionStatus, description: '识别任务状态' })
  @IsOptional()
  @IsEnum(VisionRecognitionStatus)
  status?: VisionRecognitionStatus

  @ApiPropertyOptional({ description: '按冰箱筛选' })
  @IsOptional()
  @IsString()
  fridgeId?: string
}
