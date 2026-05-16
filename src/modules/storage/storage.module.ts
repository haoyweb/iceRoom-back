import { Global, Module } from '@nestjs/common'
import { StorageService } from './storage.service'

/**
 * 全局对象存储模块。
 *
 * 注册为 @Global() 让任何业务 module 都能直接注入 StorageService，
 * 而不用在 module.imports 里逐个声明依赖。这与 DatabaseModule 一致。
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
