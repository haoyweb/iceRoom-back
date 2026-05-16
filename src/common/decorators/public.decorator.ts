import { SetMetadata } from '@nestjs/common'

/**
 * 标记接口为「公开」，跳过全局 JwtAuthGuard 校验。
 *
 * 用法：
 *   @Public()
 *   @Post('login')
 *   login(...) { ... }
 *
 * 全局 guard 在 canActivate 中通过 Reflector 读这个 metadata。
 * 命名 IS_PUBLIC_KEY 而非 PUBLIC_KEY，是约定俗成（Nest 文档示例使用同名 key），
 * 方便后来者一眼识别用途。
 */
export const IS_PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
