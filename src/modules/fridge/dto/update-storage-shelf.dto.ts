import { PartialType } from '@nestjs/swagger'
import { CreateStorageShelfDto } from './create-storage-shelf.dto'

export class UpdateStorageShelfDto extends PartialType(CreateStorageShelfDto) {}
