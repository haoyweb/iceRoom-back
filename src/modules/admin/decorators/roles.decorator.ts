import { SetMetadata } from '@nestjs/common'
import type { UserRole } from '@prisma/client'

export const ROLES_KEY = 'admin:roles'

/**
 * 端点角色要求装饰器。
 *
 * 用法：在 controller 方法上 `@Roles(UserRole.super_admin)`，配合 RolesGuard 校验。
 * 不传或传空数组等同「不限制具体角色，AdminGuard 通过即可」（即 admin / super_admin 都行）。
 * 用 metadata key 'admin:roles' 与未来可能的全局 @Public 等 key 隔离。
 */
export function Roles(...roles: UserRole[]) {
  return SetMetadata(ROLES_KEY, roles)
}
