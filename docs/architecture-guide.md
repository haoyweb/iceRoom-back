# 后端架构与分层规范

> 本文档定义 `hy-iceRoom-back` 的后端分层边界。代码放对位置，是后续可维护的第一步。

---

## 1. 核心分层

```text
HTTP 层：Controller
  ↓ 调用
业务层：Service
  ↓ 调用
数据层：PrismaService
  ↓ 操作
PostgreSQL
```

### Controller

职责：

- 声明路由。
- 接收 DTO。
- 调用 service。
- 标注 Swagger。

禁止：

- 直接调用 Prisma。
- 写复杂业务判断。
- 拼装复杂响应结构。
- 手动 try/catch 通用异常。

### Service

职责：

- 业务规则。
- 多次数据库调用编排。
- 跨模块 service 协作。
- 数据转换。

禁止：

- 读取裸 `process.env`。
- 直接操作 HTTP request / response。
- 返回和 HTTP 强绑定的结构。

### DTO

职责：

- 描述外部输入。
- 使用 `class-validator` 校验边界。
- 使用 Swagger 装饰器提供接口文档。

禁止：

- 放业务逻辑。
- 访问数据库。
- 定义内部领域状态。

### Prisma schema

职责：

- 定义数据库表结构。
- 定义枚举、关系、索引和约束。

禁止：

- 为了临时接口随意改字段名。
- 不写索引就上线高频查询字段。

---

## 2. 模块结构

推荐结构：

```text
src/modules/food/
├── dto/
│   ├── create-food.dto.ts
│   └── food-query.dto.ts
├── food.controller.ts
├── food.module.ts
├── food.service.ts
└── food.types.ts
```

规则：

- 一个业务域一个 module。
- DTO 只放请求边界类型。
- `*.types.ts` 放模块内部领域类型。
- 跨模块复用的能力不要互相硬 import 私有实现，优先抽到明确 service 或 `common/`。

---

## 3. 公共能力边界

`src/common/` 只能放跨业务域通用能力，例如：

- 统一响应。
- 统一错误码。
- 分页 DTO。
- 异常过滤器。
- 响应拦截器。

不要把具体业务规则放进 `common/`。

---

## 4. 配置边界

所有环境变量都必须：

1. 写入 `.env.example`。
2. 在 `src/config/env.validation.ts` 中校验。
3. 通过 `ConfigService` 或配置命名空间读取。

业务模块禁止直接写：

```ts
process.env.DATABASE_URL
```

---

## 5. Review 重点

- Controller 是否足够薄。
- DTO 是否覆盖外部输入边界。
- Service 是否没有泄露 HTTP 细节。
- Prisma 查询是否有明确 where、orderBy 和分页。
- 错误是否走统一异常和错误码。
- Swagger 是否能表达接口用途。
- 修改 schema 是否同步迁移和文档。
