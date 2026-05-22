import { ApiPropertyOptional } from '@nestjs/swagger'
import { RecipeDifficulty } from '@prisma/client'
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'
import { PageQueryDto } from '@/common/dto/page.dto'

/**
 * Admin 菜谱列表查询。
 *
 * keyword 走 name 模糊匹配（大小写不敏感）。category/source 是自由字符串，
 * 不做枚举校验——因为 schema 里它们就是 String?，导入源未来可能扩展，
 * 强制 enum 反而拦住合法的运营场景。
 */
export class ListRecipesQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '关键字（匹配菜谱名）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string

  @ApiPropertyOptional({ description: '分类筛选（schema 中是自由字符串）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string

  @ApiPropertyOptional({ enum: RecipeDifficulty, description: '难度筛选' })
  @IsOptional()
  @IsEnum(RecipeDifficulty)
  difficulty?: RecipeDifficulty

  @ApiPropertyOptional({ description: '来源筛选（如 seed / howtocook）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string
}
