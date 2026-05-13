import { HttpException, HttpStatus } from '@nestjs/common'
import type { ErrorCode } from './error-code.enum'

export class BusinessException extends HttpException {
  constructor(
    private readonly errorCode: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(message, status)
  }

  getErrorCode() {
    return this.errorCode
  }
}
