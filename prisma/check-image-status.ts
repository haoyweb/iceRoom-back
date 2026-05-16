import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
void (async () => {
  const sample = await prisma.recipeSuggestionRule.findFirst({
    where: { imageUrl: { startsWith: process.env.R2_PUBLIC_URL ?? 'https://pub-' } },
    select: { name: true, imageUrl: true },
  })
  console.log('SAMPLE_URL=', sample?.imageUrl ?? '(none)')
  console.log('NAME=', sample?.name ?? '(none)')

  const totalR2 = await prisma.recipeSuggestionRule.count({
    where: { imageUrl: { startsWith: process.env.R2_PUBLIC_URL ?? 'https://pub-' } },
  })
  const totalRaw = await prisma.recipeSuggestionRule.count({
    where: { imageUrl: { startsWith: 'https://raw.githubusercontent.com' } },
  })
  const totalNull = await prisma.recipeSuggestionRule.count({
    where: { imageUrl: null },
  })
  console.log('STATS=R2:' + totalR2 + ' raw:' + totalRaw + ' null:' + totalNull)
  await prisma.$disconnect()
})()
