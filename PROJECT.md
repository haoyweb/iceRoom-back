# hy-iceRoom-back 后端项目规范

> 冰箱食材临期提醒系统后端。目标不是“能跑就行”，而是提供可维护、可审查、可长期迭代的后端基础。

---

## 1. 项目定位

`hy-iceRoom-back` 服务于家庭冰箱食材管理场景，第一阶段聚焦：

- 食材库存管理。
- 冰箱层位管理。
- 临期与过期提醒。
- 基于临期食材的规则菜品推荐。

当前系统不是高并发交易系统，也不是第一阶段重 AI 平台。后端选用 TypeScript / NestJS，是为了和前端 TypeScript 技术栈对齐，降低模型和接口协作成本。

---

## 2. 技术栈

| 类型 | 技术 | 作用 |
|------|------|------|
| Runtime | Node.js 20+ | 后端运行环境 |
| Framework | NestJS | 模块化 HTTP 服务框架 |
| Language | TypeScript | 类型约束和前后端模型对齐 |
| Database | PostgreSQL | 业务主库 |
| ORM | Prisma | 数据模型、迁移、类型安全查询 |
| Validation | class-validator | DTO 入参校验 |
| Config | @nestjs/config + Joi | 环境变量加载和校验 |
| API Docs | Swagger / OpenAPI | 接口文档 |
| Test | Jest | 单元测试和 e2e 测试 |
| Package Manager | pnpm | 依赖管理 |

---

## 3. 目录结构

```text
src/
├── common/              # 跨模块公共能力
│   ├── constants/       # 全局常量
│   ├── decorators/      # 通用装饰器
│   ├── dto/             # 通用 DTO / 响应 / 分页
│   ├── enums/           # 通用枚举
│   ├── errors/          # 错误码和业务异常
│   ├── filters/         # 全局异常过滤器
│   ├── interceptors/    # 全局响应拦截器
│   └── pipes/           # 通用管道
├── config/              # 配置加载和环境变量校验
├── database/            # PrismaService 和数据库模块
├── modules/             # 业务模块
│   ├── health/          # 健康检查
│   ├── user/            # 用户边界
│   ├── auth/            # 鉴权边界
│   ├── fridge/          # 冰箱和层位
│   ├── food/            # 食材库存
│   └── recipe-suggestion/ # 菜品推荐
├── app.module.ts
└── main.ts
```

---

## 4. 常用命令

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm lint:fix
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm prisma:studio
```

---

## 5. 开发原则

1. Controller 只处理 HTTP 边界，不写业务规则。
2. Service 负责业务编排和数据库访问。
3. DTO 负责外部输入校验，禁止裸对象直接进 service。
4. Prisma schema 是数据库事实来源。
5. 环境变量必须经过 `src/config/env.validation.ts` 校验。
6. 业务错误统一使用 `BusinessException` 和 `ErrorCode`。
7. API 返回结构由全局拦截器统一包装。
8. 新增模块必须同步补 Swagger、测试和文档说明。

---

## 6. MVP 接口闭环

当前后端优先支持“用户 → 冰箱 → 层位 → 食材 → 临期 → 推荐”的最小业务闭环：

1. 创建用户。
2. 创建用户下的冰箱。
3. 创建冰箱层位。
4. 创建食材并绑定冰箱和层位。
5. 查询临期食材。
6. 根据冰箱内可用食材推荐菜品。
7. 将食材标记为已吃完或已丢弃。
8. 创建冰箱时自动生成默认层位。
9. 创建食材时支持后端自动估算到期日期。
10. 做饭后批量扣减食材库存，扣至 0 自动标记为已吃完。
11. 菜品推荐按临期食材优先级排序，并返回命中的具体食材。

前端设计图未完成前，不主动实现页面；后端接口和 Swagger 先保持稳定。

---

## 7. 交付前最低要求

每次提交前至少执行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

如果修改了 Prisma schema，还要执行：

```bash
pnpm prisma:generate
pnpm prisma:migrate
```

详见 `docs/delivery-checklist.md`。
