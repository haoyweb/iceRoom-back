# iceRoom-back 后端

> 家庭冰箱食材临期提醒与库存管理系统的后端服务。
> 配套前端：[iceRoom](https://github.com/haoyweb/iceRoom)

---

## 技术栈

| 类型 | 选型 |
|---|---|
| 运行时 | Node.js ≥ 20 |
| 框架 | NestJS 11 |
| 语言 | TypeScript |
| 数据库 | PostgreSQL |
| ORM | Prisma 6 |
| 入参校验 | class-validator + class-transformer |
| 配置校验 | @nestjs/config + Joi |
| API 文档 | Swagger / OpenAPI |
| 测试 | Jest（单元 + e2e） |
| 包管理 | pnpm ≥ 9 |

---

## 主要能力

围绕"用户 → 冰箱 → 层位 → 食材 → 临期 → 推荐"形成完整业务闭环:

- 用户、冰箱、冰箱层位的 CRUD
- 创建冰箱时自动生成默认层位（冷藏 / 冷冻 / 门架 / 抽屉）
- 食材的添加、查询、更新、状态变更（已吃完 / 已丢弃）
- 创建食材时支持自动估算到期日期
- 临期食材查询（按天数过滤、含已过期项）
- 做饭后批量扣减食材库存，库存归零自动标记为已吃完
- 基于冰箱当前食材的规则型菜品推荐，按临期优先级排序

---

## 快速开始

### 1. 环境要求

- Node.js ≥ 20
- pnpm ≥ 9
- PostgreSQL ≥ 14（本地或远程均可）

### 2. 准备数据库

本地新建一个数据库（默认名 `hy_ice_room`）:

```sql
CREATE DATABASE hy_ice_room;
```

### 3. 安装依赖

```bash
pnpm install
```

### 4. 配置环境变量

复制示例文件并按需修改:

```bash
cp .env.example .env
```

关键变量:

```env
NODE_ENV=development
PORT=8089
CORS_ORIGIN=*                # 生产环境请改为具体白名单
SWAGGER_ENABLED=true         # 生产建议关闭
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/hy_ice_room?schema=public
```

所有环境变量都会经过 `src/config/env.validation.ts` 的 Joi 校验,缺失或非法时启动会直接失败。

### 5. 数据库迁移与 seed

```bash
pnpm prisma:generate    # 生成 Prisma Client
pnpm prisma:migrate     # 执行迁移
pnpm prisma:seed        # 写入种子数据（可选）
```

### 6. 启动服务

```bash
pnpm dev                # 开发模式（watch）
pnpm build && pnpm start # 生产模式
```

启动成功后：

- 服务地址：`http://localhost:8089`
- API 前缀：`/api/v1`
- Swagger 文档：`http://localhost:8089/api/docs`（当 `SWAGGER_ENABLED=true`）
- 健康检查：`GET /api/v1/health`

---

## 主要接口

所有接口前缀 `/api/v1`,统一返回结构:

```json
{ "code": 0, "message": "success", "data": {}, "timestamp": "...", "path": "..." }
```

| 模块 | 方法 | 路径 |
|---|---|---|
| 健康 | GET | `/health` |
| 用户 | GET / POST | `/users` |
| 用户 | GET / PATCH / DELETE | `/users/:id` |
| 冰箱 | GET / POST | `/fridges` |
| 冰箱 | GET / PATCH / DELETE | `/fridges/:id` |
| 层位 | GET / POST | `/fridges/:fridgeId/shelves` |
| 层位 | POST | `/fridges/:fridgeId/shelves/reset-defaults` |
| 层位 | GET / PATCH / DELETE | `/fridges/:fridgeId/shelves/:shelfId` |
| 食材 | GET / POST | `/foods` |
| 食材 | GET | `/foods/expiring` |
| 食材 | POST | `/foods/consume-batch` |
| 食材 | GET / PATCH / DELETE | `/foods/:id` |
| 食材 | PATCH | `/foods/:id/status` |
| 推荐 | POST | `/recipe-suggestions` |
| 推荐 | GET | `/recipe-suggestions/by-fridge` |

完整字段、参数和响应模型见 Swagger 文档 (`/api/docs`)。

---

## 常用命令

```bash
pnpm dev              # 开发（nest start --watch）
pnpm build            # 编译输出 dist/
pnpm start            # 跑编译后的 dist/main.js
pnpm lint             # ESLint（max-warnings=0）
pnpm lint:fix         # 自动修复
pnpm typecheck        # tsc --noEmit
pnpm test             # Jest 单元测试
pnpm test:e2e         # Jest e2e 测试
pnpm prisma:generate  # 生成 Prisma Client
pnpm prisma:migrate   # 执行迁移
pnpm prisma:seed      # 种子数据
pnpm prisma:studio    # 数据库可视化
```

---

## 项目结构

```
src/
├── common/             # 跨模块公共能力（dto / errors / filters / interceptors）
├── config/             # 配置加载与环境变量校验
├── database/           # PrismaService 和数据库模块
├── modules/            # 业务模块
│   ├── health/         # 健康检查
│   ├── user/           # 用户
│   ├── auth/           # 鉴权
│   ├── fridge/         # 冰箱与层位
│   ├── food/           # 食材库存
│   └── recipe-suggestion/  # 菜品推荐
├── app.module.ts
└── main.ts

prisma/
├── schema.prisma       # 数据模型定义
├── migrations/         # 迁移历史
└── seed.ts             # 种子脚本
```

更详细的目录约定、分层规范、错误码、Swagger 写法见 [`PROJECT.md`](./PROJECT.md)。

---

## 开发原则

1. Controller 只处理 HTTP 边界,不写业务规则
2. Service 负责业务编排与数据库访问
3. DTO 负责入参校验,禁止裸对象进 Service
4. Prisma schema 是数据库事实来源
5. 环境变量必须经过 Joi 校验
6. 业务错误统一使用 `BusinessException` + `ErrorCode`
7. API 响应由全局拦截器统一包装
8. 新增模块必须同步补 Swagger、测试、文档

---

## 交付前自检

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

若改动了 Prisma schema,还需额外执行:

```bash
pnpm prisma:generate && pnpm prisma:migrate
```

详见 [`docs/delivery-checklist.md`](./docs/delivery-checklist.md)。

---

## 相关文档

| 文档 | 内容 |
|---|---|
| [`PROJECT.md`](./PROJECT.md) | 项目规范与目录详解 |
| [`docs/api-guide.md`](./docs/api-guide.md) | 接口设计规范 |
| [`docs/architecture-guide.md`](./docs/architecture-guide.md) | 架构设计说明 |
| [`docs/database-guide.md`](./docs/database-guide.md) | 数据库设计与迁移规范 |
| [`docs/delivery-checklist.md`](./docs/delivery-checklist.md) | 交付前检查清单 |

---

## License

私有项目，未授权。
