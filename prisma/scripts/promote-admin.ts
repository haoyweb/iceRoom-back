/**
 * 提权脚本：把指定 username 的用户升级为 super_admin。
 *
 * 用法：
 *   pnpm admin:promote <username>
 *   pnpm admin:promote <username> --role admin     # 降级为普通 admin（默认 super_admin）
 *
 * 设计要点：
 *   - 不允许凭空创建用户——只能提权已经在 C 端注册过的账号，避免脚本权限滥用
 *   - 默认提到 super_admin 是为了「线上第一次部署，必须先有一个能动其他人的兜底位」
 *   - 后续提其它 admin 应该走运营后台界面，而不是这个脚本（脚本走 SSH，留痕困难）
 *   - 幂等：重复对已是 super_admin 的人执行不会报错，只是 update 同样的值一次
 */
import process from 'node:process'
import { PrismaClient, UserRole } from '@prisma/client'

function parseArgs() {
  const args = process.argv.slice(2)
  const username = args.find(a => !a.startsWith('--'))
  if (!username) {
    throw new Error('Usage: pnpm admin:promote <username> [--role admin|super_admin]')
  }

  const roleIndex = args.indexOf('--role')
  let role: UserRole = UserRole.super_admin
  if (roleIndex !== -1) {
    const raw = args[roleIndex + 1]
    if (raw !== 'admin' && raw !== 'super_admin') {
      throw new Error(`Invalid --role value: ${raw}. Must be 'admin' or 'super_admin'.`)
    }
    role = raw === 'admin' ? UserRole.admin : UserRole.super_admin
  }

  return { username, role }
}

async function main() {
  const { username, role } = parseArgs()
  const prisma = new PrismaClient()

  try {
    const existing = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, role: true, status: true },
    })

    if (!existing) {
      throw new Error(
        `User "${username}" not found. 请先在 C 端用该用户名注册账号，再运行此脚本提权。`,
      )
    }

    if (existing.status === 'banned') {
      throw new Error(
        `User "${username}" is banned. 请先解封后再提权，或直接在 DB 中 update status='active'。`,
      )
    }

    const updated = await prisma.user.update({
      where: { username },
      data: { role },
      select: { id: true, username: true, role: true },
    })

    console.log(`[promote-admin] 成功: ${updated.username} (id=${updated.id}) 角色 → ${updated.role}`)
  }
  finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('[promote-admin] 失败:', err instanceof Error ? err.message : err)
  process.exit(1)
})
