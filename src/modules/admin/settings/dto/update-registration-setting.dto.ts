import { IsBoolean } from 'class-validator'

export class UpdateRegistrationSettingDto {
  @IsBoolean({ message: 'enabled 必须是布尔值' })
  enabled!: boolean
}
