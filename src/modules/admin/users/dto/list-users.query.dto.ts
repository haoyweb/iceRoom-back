import { ApiPropertyOptional } from '@nestjs/swagger'
import { UserRole, UserStatus } from '@prisma/client'
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'
import { PageQueryDto } from '@/common/dto/page.dto'

/**
 * Admin 用户列表查询参数。
 *
 * keyword 模糊匹配 username / nickname；空字符串视为不筛选（前端清空输入框时通常发空串）。
 * role / status 严格 enum，前端误传非枚举值会被 ValidationPipe 拒绝。
 */
export class ListUsersQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '关键字（匹配 username / nickname）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string

  @ApiPropertyOptional({ enum: UserRole, description: '按角色筛选' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole

  @ApiPropertyOptional({ enum: UserStatus, description: '按状态筛选' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus
}
