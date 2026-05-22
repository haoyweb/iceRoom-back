import { ApiPropertyOptional } from '@nestjs/swagger'
import { VisionRecognitionStatus } from '@prisma/client'
import { Type } from 'class-transformer'
import { IsDate, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'
import { PageQueryDto } from '@/common/dto/page.dto'

/**
 * Admin 识别任务列表 / 统计共用 query。
 *
 * 日期范围用 ISO 字符串传，由 class-transformer 自动转 Date。
 * 不在 DTO 里校验「dateFrom <= dateTo」——service 层兜底，避免双层校验维护两份。
 */
export class ListVisionJobsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: VisionRecognitionStatus, description: '识别状态' })
  @IsOptional()
  @IsEnum(VisionRecognitionStatus)
  status?: VisionRecognitionStatus

  @ApiPropertyOptional({ description: 'Provider 名（如 qwen）' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  provider?: string

  @ApiPropertyOptional({ description: '按用户 ID 过滤' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  userId?: string

  @ApiPropertyOptional({ description: '创建时间 from（ISO 字符串）' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFrom?: Date

  @ApiPropertyOptional({ description: '创建时间 to（ISO 字符串）' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateTo?: Date
}

export class VisionJobsStatsQueryDto {
  @ApiPropertyOptional({ description: '创建时间 from' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFrom?: Date

  @ApiPropertyOptional({ description: '创建时间 to' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateTo?: Date
}
