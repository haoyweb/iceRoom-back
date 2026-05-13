# 后端交付自检清单

> 每次交付前都要过这份清单。后端质量不只看接口能不能调通，还要看边界、回归和长期维护成本。

---

## 1. 基础命令

至少执行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

如果修改了 Prisma schema：

```bash
pnpm prisma:generate
pnpm prisma:migrate
```

---

## 2. 分层检查

- [ ] Controller 是否只处理 HTTP 边界。
- [ ] Service 是否承载业务规则和数据访问。
- [ ] DTO 是否覆盖所有外部输入。
- [ ] 是否没有在业务模块直接读取 `process.env`。
- [ ] 是否没有绕过 `PrismaService` 创建新的 PrismaClient。
- [ ] 是否没有在业务代码手动拼统一响应外壳。

---

## 3. API 检查

- [ ] 路由是否符合 REST 命名。
- [ ] 成功和失败响应是否保持统一结构。
- [ ] 错误是否使用 `BusinessException` 和 `ErrorCode`。
- [ ] 分页接口是否有默认 page/pageSize 和最大限制。
- [ ] Swagger 是否能看懂接口用途。
- [ ] DTO 非法字段是否会被拒绝。

---

## 4. 数据库检查

- [ ] schema 修改是否同步迁移。
- [ ] 高频查询字段是否有索引。
- [ ] 关系删除策略是否明确。
- [ ] 查询列表是否有分页。
- [ ] seed 是否只包含开发/演示数据。

---

## 5. 边界条件

- [ ] 空列表是否返回稳定结构。
- [ ] 不存在资源是否有明确错误码。
- [ ] 非法枚举是否被 DTO 拦截。
- [ ] 日期字段是否能处理过期、今天到期、未来到期。
- [ ] 重复创建是否有数据库约束或业务判断。

---

## 6. 回归风险

重点关注是否修改了：

- 全局异常过滤器。
- 全局响应拦截器。
- 环境变量校验。
- Prisma schema。
- DTO 基类或分页结构。
- API prefix/versioning。

这些改动会影响大量接口，提交前必须额外验证。
