import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'

/**
 * Dashboard 趋势查询。
 *
 * days 限定到 7 / 30 / 90 三档——MVP 不做任意天数：
 *   - 任意 days 容易让前端传超大值导致 group by 慢
 *   - 三档对运营足够（一周看变动 / 一月看趋势 / 一季度看健康度）
 */
export class DashboardTrendQueryDto {
  @ApiPropertyOptional({ enum: [7, 30, 90], default: 7, description: '回看天数' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  @IsIn([7, 30, 90])
  days?: number = 7
}
