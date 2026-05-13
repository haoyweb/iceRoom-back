import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Prisma, PrismaClient } from '@prisma/client'

// 食材数量都是小数值，统一以 number 出参，避免前端再做字符串→数字转换。
// 若未来引入金额等大数字段，需为该字段单独保留字符串序列化。
Prisma.Decimal.prototype.toJSON = function toJSON(this: Prisma.Decimal) {
  return this.toNumber()
} as unknown as () => string

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
