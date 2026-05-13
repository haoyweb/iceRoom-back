# API 设计规范

> API 规范的目标是让前端稳定接入，而不是每个接口单独猜响应结构。

---

## 1. 路由规范

全局前缀：

```text
/api/v1
```

示例：

```text
GET    /api/v1/health
GET    /api/v1/users
POST   /api/v1/users
GET    /api/v1/users/:id
PATCH  /api/v1/users/:id
DELETE /api/v1/users/:id
GET    /api/v1/fridges
POST   /api/v1/fridges
GET    /api/v1/fridges/:id
PATCH  /api/v1/fridges/:id
DELETE /api/v1/fridges/:id
GET    /api/v1/fridges/:fridgeId/shelves
POST   /api/v1/fridges/:fridgeId/shelves
POST   /api/v1/fridges/:fridgeId/shelves/reset-defaults
GET    /api/v1/fridges/:fridgeId/shelves/:shelfId
PATCH  /api/v1/fridges/:fridgeId/shelves/:shelfId
DELETE /api/v1/fridges/:fridgeId/shelves/:shelfId
GET    /api/v1/foods
POST   /api/v1/foods
POST   /api/v1/foods/consume-batch
GET    /api/v1/foods/expiring
GET    /api/v1/foods/:id
PATCH  /api/v1/foods/:id
DELETE /api/v1/foods/:id
PATCH  /api/v1/foods/:id/status
POST   /api/v1/recipe-suggestions
GET    /api/v1/recipe-suggestions/by-fridge
```

资源命名使用复数名词，动作优先通过 HTTP Method 表达。

---

## 2. 统一响应

成功响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "timestamp": "2026-05-12T00:00:00.000Z",
  "path": "/api/v1/foods"
}
```

错误响应：

```json
{
  "code": 40001,
  "message": "name must be longer than or equal to 1 characters",
  "data": null,
  "timestamp": "2026-05-12T00:00:00.000Z",
  "path": "/api/v1/foods"
}
```

响应包装由 `ResponseInterceptor` 统一处理，业务代码不要手动拼外层结构。

---

## 3. 错误码规范

错误码定义在：

```text
src/common/errors/error-code.enum.ts
```

规则：

- `0` 表示成功。
- `4xxxx` 表示请求或权限问题。
- `5xxxx` 表示服务端或数据库问题。
- 业务域错误使用独立区间，例如食材使用 `3xxxx`。

业务错误使用：

```ts
throw new BusinessException(ErrorCode.FOOD_NOT_FOUND, '食材不存在')
```

不要直接抛普通字符串错误。

---

## 4. DTO 校验

所有外部输入必须经过 DTO：

```ts
@Post()
create(@Body() data: CreateFoodDto) {
  return this.foodService.create(data)
}
```

DTO 要求：

- 必填字段明确。
- 可选字段使用 `@IsOptional()`。
- 枚举字段使用 `@IsEnum()`。
- 数字字段使用 `@Type(() => Number)` 配合数值校验。
- 每个对外字段尽量补 `@ApiProperty` 或 `@ApiPropertyOptional`。

---

## 5. 分页规范

分页查询继承 `PageQueryDto`：

```ts
export class FoodQueryDto extends PageQueryDto {}
```

分页响应使用：

```json
{
  "list": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

默认 `page=1`，`pageSize=20`，最大 `pageSize=100`。

---

## 6. 业务规则接口说明

### 6.1 默认冰箱层位

创建冰箱时，后端会自动创建默认层位：门架、冷藏上层、冷藏下层、保鲜抽屉、冷冻层。

如果后续需要补齐缺失默认层位，可以调用：

```text
POST /api/v1/fridges/:fridgeId/shelves/reset-defaults
```

该接口只补缺失默认层位，不删除用户自定义层位，也不移动已有食材。

### 6.2 食材到期日自动推算

`POST /api/v1/foods` 中 `expireDate` 是可选字段：

- 传入 `expireDate`：后端按用户手动日期保存，`expireDateSource=manual`。
- 不传 `expireDate`：后端按食材名称、分类、层位区域和 `purchaseDate ?? 当前时间` 自动估算，`expireDateSource=auto`。

### 6.3 批量扣减库存

做饭后可调用：

```text
POST /api/v1/foods/consume-batch
```

请求：

```json
{
  "recipeName": "番茄炒蛋",
  "items": [
    { "foodId": "food_id", "quantity": 1 }
  ]
}
```

规则：

- 只允许扣减 `normal` 状态食材。
- 食材必须有 `quantity`。
- 扣减数量必须大于 0，且不能超过当前库存。
- 扣减到 0 时自动将状态更新为 `consumed`。
- 批量扣减使用事务，任一项失败则全部失败。

### 6.4 按冰箱推荐菜品

```text
GET /api/v1/recipe-suggestions/by-fridge?fridgeId=xxx
```

该接口会读取冰箱内 `normal` 食材，按临期优先级、匹配数量、缺失食材数量、热度和预计耗时排序。

返回中包含：

- `matchedFoods`：命中的具体食材。
- `usedExpiringFoodIds`：命中的 7 天内到期食材 ID。
- `expiringScore`：临期优先级得分。

---

## 7. Swagger 规范

每个 Controller 必须：

- 使用 `@ApiTags()`。
- 对主要接口使用 `@ApiOkResponse()` 或 `@ApiCreatedResponse()`。
- 查询参数使用 `@ApiQuery()` 或 DTO Swagger 装饰器。

Swagger 地址：

```text
/api/docs
```

生产环境是否开启由 `SWAGGER_ENABLED` 控制。
