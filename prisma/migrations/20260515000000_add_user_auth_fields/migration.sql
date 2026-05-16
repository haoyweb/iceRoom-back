-- 给 User 表加鉴权字段：username (唯一)、passwordHash (必填)、avatar (可选)；
-- 同时把原来强制 NOT NULL 的 nickname 放宽为可选——注册时不强制要求。
--
-- 前置条件：已通过 `pnpm db:wipe-users` 清空所有 User 行（cascade 清掉
-- Fridge/StorageShelf/FoodItem）。NOT NULL 列只能加在空表上，否则 PG 拒绝。

-- AlterTable
ALTER TABLE "User" ADD COLUMN "username" TEXT NOT NULL;
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT NOT NULL;
ALTER TABLE "User" ADD COLUMN "avatar" TEXT;
ALTER TABLE "User" ALTER COLUMN "nickname" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
