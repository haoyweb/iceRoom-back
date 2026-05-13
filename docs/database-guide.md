# 数据库与 Prisma 规范

> Prisma schema 是数据库结构的事实来源。所有字段、关系、索引和枚举都应先在 schema 中清晰表达。

---

## 1. 核心模型

第一阶段模型：

- `User`：用户边界。
- `Fridge`：冰箱实例。
- `StorageShelf`：冰箱层位。
- `FoodItem`：食材库存。
- `RecipeSuggestionRule`：菜品推荐规则。

`FoodItem.expireDateSource` 用于标记到期日期来源：

- `manual`：用户手动设置。
- `auto`：后端根据食材保鲜规则估算。

---

## 2. 字段命名

- 数据库模型使用 PascalCase，例如 `FoodItem`。
- 字段使用 camelCase，例如 `expireDate`。
- 主键统一使用 `id String @id @default(cuid())`。
- 时间字段统一使用：
  - `createdAt DateTime @default(now())`
  - `updatedAt DateTime @updatedAt`

---

## 3. 关系与索引

高频查询字段必须考虑索引：

- `Fridge.userId`
- `StorageShelf.fridgeId`
- `FoodItem.fridgeId + expireDate`
- `FoodItem.shelfId`
- `FoodItem.status`

写查询时要明确：

- `where`
- `orderBy`
- 分页 `skip/take`

不要在接口里无边界返回大列表。

---

## 4. 迁移规范

修改 `prisma/schema.prisma` 后执行：

```bash
pnpm prisma:generate
pnpm prisma:migrate
```

迁移命名应表达业务意图，例如：

```text
add_food_expire_date_index
create_recipe_suggestion_rules
```

不要为了绕过问题直接改数据库而不提交 schema 变化。

---

## 5. Seed 规范

`prisma/seed.ts` 只放本地开发和演示所需的基础数据，例如：

- 常见菜品推荐规则。
- 默认测试用户。
- 默认冰箱层位。

seed 数据不能依赖生产环境真实数据。

---

## 6. Decimal 与日期

食材数量使用 `Decimal`，避免浮点误差。

日期字段：

- 对外 DTO 接收 ISO 字符串。
- Service 转换成 `Date`。
- 临期判断以自然日为边界，不用当前小时影响结果。
- `expireDate` 可以由用户手动提供，也可以由后端根据食材名称、分类和层位区域自动估算。
- 自动估算规则当前放在 `src/modules/food/food-freshness.constants.ts`，不是数据库表；等规则需要后台配置时再迁移为表。
