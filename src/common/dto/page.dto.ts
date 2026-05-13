import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants/app.constants'

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = DEFAULT_PAGE

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
