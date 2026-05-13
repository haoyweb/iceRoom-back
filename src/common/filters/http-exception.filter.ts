import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common'
import { Catch, HttpException, HttpStatus } from '@nestjs/common'
import { BusinessException } from '../errors/business.exception'
import { ErrorCode } from '../errors/error-code.enum'

interface ResponseLike {
  status: (code: number) => ResponseLike
  json: (body: unknown) => void
}

interface RequestLike {
  originalUrl?: string
  url?: string
}

interface ValidationErrorResponse {
  message?: string | string[]
  error?: string
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp()
    const response = context.getResponse<ResponseLike>()
    const request = context.getRequest<RequestLike>()
    const path = request.originalUrl ?? request.url ?? ''

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    const errorCode = this.resolveErrorCode(exception, status)
    const message = this.resolveMessage(exception)

    response.status(status).json({
      code: errorCode,
      message,
      data: null,
      timestamp: new Date().toISOString(),
      path,
    })
  }

  private resolveErrorCode(exception: unknown, status: number) {
    if (exception instanceof BusinessException) {
      return exception.getErrorCode()
    }

    switch (status) {
      case Number(HttpStatus.BAD_REQUEST):
        return ErrorCode.VALIDATION_ERROR
      case Number(HttpStatus.UNAUTHORIZED):
        return ErrorCode.UNAUTHORIZED
      case Number(HttpStatus.FORBIDDEN):
        return ErrorCode.FORBIDDEN
      case Number(HttpStatus.NOT_FOUND):
        return ErrorCode.NOT_FOUND
      case Number(HttpStatus.CONFLICT):
        return ErrorCode.CONFLICT
      default:
        return ErrorCode.INTERNAL_ERROR
    }
  }

  private resolveMessage(exception: unknown) {
    if (!(exception instanceof HttpException)) {
      return 'Internal server error'
    }

    const response = exception.getResponse()

    if (typeof response === 'string') {
      return response
    }

    const errorResponse = response as ValidationErrorResponse

    if (Array.isArray(errorResponse.message)) {
      return errorResponse.message.join('; ')
    }

    return errorResponse.message ?? exception.message
  }
}
