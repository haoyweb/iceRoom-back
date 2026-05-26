import { ApiProperty } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { IsEnum } from 'class-validator'

export class UpdateUserRoleDto {
  @ApiProperty({ enum: UserRole, description: '目标角色' })
  @IsEnum(UserRole, { message: '角色不合法' })
  role!: UserRole
}
