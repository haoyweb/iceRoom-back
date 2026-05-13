import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, Length } from 'class-validator'

export class UpdateFridgeDto {
  @ApiPropertyOptional({ example: '家用冰箱' })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  name?: string
}
