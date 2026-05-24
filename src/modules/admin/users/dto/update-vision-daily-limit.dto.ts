import { IsInt, Max, Min } from 'class-validator'

export class UpdateVisionDailyLimitDto {
  @IsInt({ message: '每日识别额度必须是整数' })
  @Min(0, { message: '每日识别额度不能小于 0' })
  @Max(1000, { message: '每日识别额度不能超过 1000' })
  visionDailyLimit!: number
}
