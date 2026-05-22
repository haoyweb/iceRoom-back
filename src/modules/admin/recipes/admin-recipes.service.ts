import { HttpStatus, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { createPageResult } from '@/common/dto/page.dto'
import { BusinessException } from '@/common/errors/business.exception'
import { ErrorCode } from '@/common/errors/error-code.enum'
import { PrismaService } from '@/database/prisma.service'
import type { ListRecipesQueryDto } from './dto/list-recipes.query.dto'
import type { CreateRecipeDto, UpdateRecipeDto } from './dto/upsert-recipe.dto'

/**
 * 运营后台菜谱管理。直接 CRUD `RecipeSuggestionRule`，
 * 与 C 端 RecipeSuggestionService 共用同一张表——所以 admin 改的菜谱会立即出现在 C 端推荐。
 *
 * MVP 不做软删——删了就是删了。C 端 import-helpers 静态字典做兜底，业务无致命影响。
 */
@Injectable()
export class AdminRecipesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListRecipesQueryDto) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const where: Prisma.RecipeSuggestionRuleWhereInput = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.keyword?.trim()
        ? { name: { contains: query.keyword.trim(), mode: 'insensitive' } }
        : {}),
    }

    const [rows, total] = await Promise.all([
      this.prisma.recipeSuggestionRule.findMany({
        where,
        orderBy: [{ popularityScore: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          difficulty: true,
          estimatedMinutes: true,
          popularityScore: true,
          source: true,
          category: true,
          imageUrl: true,
          updatedAt: true,
        },
      }),
      this.prisma.recipeSuggestionRule.count({ where }),
    ])

    return createPageResult(rows, total, page, pageSize)
  }

  async getById(id: string) {
    const recipe = await this.prisma.recipeSuggestionRule.findUnique({ where: { id } })
    if (!recipe) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '菜谱不存在', HttpStatus.NOT_FOUND)
    }
    return recipe
  }

  async create(dto: CreateRecipeDto) {
    try {
      return await this.prisma.recipeSuggestionRule.create({
        data: {
          name: dto.name,
          requiredIngredients: dto.requiredIngredients,
          optionalIngredients: dto.optionalIngredients ?? [],
          missingIngredients: dto.missingIngredients ?? [],
          difficulty: dto.difficulty,
          estimatedMinutes: dto.estimatedMinutes,
          reasonTemplate: dto.reasonTemplate,
          popularityScore: dto.popularityScore ?? 0,
          source: dto.source ?? null,
          category: dto.category ?? null,
          instructions: dto.instructions ?? [],
          // Prisma JSON 字段写 null 必须用 Prisma.JsonNull 显式表达——
          // 直接写 JS null 会被类型系统拒绝（区分「null 值」和「JS undefined 表示不变」）
          stepImages: dto.stepImages ? (dto.stepImages as Prisma.InputJsonValue) : Prisma.JsonNull,
          portions: dto.portions ? (dto.portions as Prisma.InputJsonValue) : Prisma.JsonNull,
          tips: dto.tips ?? null,
          imageUrl: dto.imageUrl ?? null,
          imageSourceUrl: dto.imageSourceUrl ?? null,
          sourceRefUrl: dto.sourceRefUrl ?? null,
        },
      })
    }
    catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BusinessException(ErrorCode.CONFLICT, '同名菜谱已存在', HttpStatus.CONFLICT)
      }
      throw err
    }
  }

  async update(id: string, dto: UpdateRecipeDto) {
    await this.getById(id)
    try {
      // 显式构造 data：避免 PartialType 把 undefined 字段当成「显式 null 写入」破坏现有数据
      const data: Prisma.RecipeSuggestionRuleUpdateInput = {}
      if (dto.name !== undefined) data.name = dto.name
      if (dto.requiredIngredients !== undefined) data.requiredIngredients = dto.requiredIngredients
      if (dto.optionalIngredients !== undefined) data.optionalIngredients = dto.optionalIngredients
      if (dto.missingIngredients !== undefined) data.missingIngredients = dto.missingIngredients
      if (dto.difficulty !== undefined) data.difficulty = dto.difficulty
      if (dto.estimatedMinutes !== undefined) data.estimatedMinutes = dto.estimatedMinutes
      if (dto.reasonTemplate !== undefined) data.reasonTemplate = dto.reasonTemplate
      if (dto.popularityScore !== undefined) data.popularityScore = dto.popularityScore
      if (dto.source !== undefined) data.source = dto.source
      if (dto.category !== undefined) data.category = dto.category
      if (dto.instructions !== undefined) data.instructions = dto.instructions
      if (dto.stepImages !== undefined) {
        data.stepImages = dto.stepImages ? (dto.stepImages as Prisma.InputJsonValue) : Prisma.JsonNull
      }
      if (dto.portions !== undefined) {
        data.portions = dto.portions ? (dto.portions as Prisma.InputJsonValue) : Prisma.JsonNull
      }
      if (dto.tips !== undefined) data.tips = dto.tips
      if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl
      if (dto.imageSourceUrl !== undefined) data.imageSourceUrl = dto.imageSourceUrl
      if (dto.sourceRefUrl !== undefined) data.sourceRefUrl = dto.sourceRefUrl

      return await this.prisma.recipeSuggestionRule.update({ where: { id }, data })
    }
    catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BusinessException(ErrorCode.CONFLICT, '同名菜谱已存在', HttpStatus.CONFLICT)
      }
      throw err
    }
  }

  async remove(id: string) {
    await this.getById(id)
    await this.prisma.recipeSuggestionRule.delete({ where: { id } })
    return { id, deleted: true as const }
  }
}
