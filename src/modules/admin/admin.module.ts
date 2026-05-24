import { Module } from '@nestjs/common'
import { AdminDashboardController } from './dashboard/admin-dashboard.controller'
import { AdminDashboardService } from './dashboard/admin-dashboard.service'
import { AdminGuard } from './guards/admin.guard'
import { RolesGuard } from './guards/roles.guard'
import { SettingsModule } from '../settings/settings.module'
import { AdminRecipesController } from './recipes/admin-recipes.controller'
import { AdminRecipesService } from './recipes/admin-recipes.service'
import { AdminSettingsController } from './settings/admin-settings.controller'
import { AdminSettingsService } from './settings/admin-settings.service'
import { AdminUsersController } from './users/admin-users.controller'
import { AdminUsersService } from './users/admin-users.service'
import { AdminVisionJobsController } from './vision-jobs/admin-vision-jobs.controller'
import { AdminVisionJobsService } from './vision-jobs/admin-vision-jobs.service'

/**
 * 运营后台聚合模块。
 *
 * 按资源分子模块：users / recipes / vision-jobs / dashboard，
 * 每个子模块各自的 controller/service/dto 都收敛在对应目录下。
 *
 * AdminGuard / RolesGuard 作为 module 级别的 provider 注册——
 * 子模块的 controller 直接 @UseGuards(AdminGuard, RolesGuard) 引用即可，
 * 不需要 @Global()。
 */
@Module({
  imports: [SettingsModule],
  controllers: [
    AdminUsersController,
    AdminRecipesController,
    AdminVisionJobsController,
    AdminDashboardController,
    AdminSettingsController,
  ],
  providers: [
    AdminGuard,
    RolesGuard,
    AdminUsersService,
    AdminRecipesService,
    AdminVisionJobsService,
    AdminDashboardService,
    AdminSettingsService,
  ],
})
export class AdminModule {}
