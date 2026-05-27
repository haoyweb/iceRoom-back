import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, Max, Min } from 'class-validator'

export class SnoozeFoodReminderDto {
  // 范围 1-168（一周）。上限避免「无限延后」语义，超出建议改用 ignore 表达「不再提醒」。
  @ApiProperty({ example: 24, description: 'Snooze duration in hours (1-168).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  snoozeHours!: number
}
