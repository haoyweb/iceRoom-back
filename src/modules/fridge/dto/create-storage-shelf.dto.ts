import { ApiProperty } from '@nestjs/swagger'
import { StorageArea } from '@prisma/client'
import { IsEnum, IsInt, IsString, Length, Min } from 'class-validator'

export class CreateStorageShelfDto {
  @ApiProperty({ enum: StorageArea, example: StorageArea.fridge })
  @IsEnum(StorageArea)
  area!: StorageArea

  @ApiProperty({ example: '第 1 层' })
  @IsString()
  @Length(1, 40)
  name!: string

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  sort!: number
}
