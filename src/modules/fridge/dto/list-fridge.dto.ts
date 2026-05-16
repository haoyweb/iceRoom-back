// 列表接口的 userId 已经从 query 移除——后端从 JWT 自动取 @CurrentUser('id')，
// 前端再传 userId 会被全局 ValidationPipe 的 forbidNonWhitelisted 拒绝。
// 保留空类壳是为了未来加分页/筛选时有挂钩点。
export class ListFridgeDto {}

