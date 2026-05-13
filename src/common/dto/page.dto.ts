import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants/app.constants'

export class PageQueryDto {
  @ApiPropertyOptional({ example: DEFAULT_PAGE, default: DEFAULT_PAGE, minimum: 1, description: '页码，从 1 开始' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = DEFAULT_PAGE

  @ApiPropertyOptional({ example: DEFAULT_PAGE_SIZE, default: DEFAULT_PAGE_SIZE, minimum: 1, maximum: MAX_PAGE_SIZE, description: '每页大小' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number = DEFAULT_PAGE_SIZE
}

export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export function createPageResult<T>(list: T[], total: number, page: number, pageSize: number): PageResult<T> {
  return {
    list,
    total,
    page,
    pageSize,
  }
}
