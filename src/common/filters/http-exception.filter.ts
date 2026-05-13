import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common'
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { BusinessException } from '../errors/business.exception'
import { ErrorCode } from '../errors/error-code.enum'

interface ResponseLike {
  status: (code: number) => ResponseLike
  json: (body: unknown) => void
}

interface RequestLike {
  originalUrl?: string
  url?: string
  method?: string
}

interface ValidationErrorResponse {
  message?: string | string[]
  error?: string
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp()
    const response = context.getResponse<ResponseLike>()
    const request = context.getRequest<RequestLike>()
    const path = request.originalUrl ?? request.url ?? ''
    const method = request.method ?? ''

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    const errorCode = this.resolveErrorCode(exception, status)
    const message = this.resolveMessage(exception)

    this.logException(exception, status, method, path, message)

    response.status(status).json({
      code: errorCode,
      message,
      data: null,
      timestamp: new Date().toISOString(),
      path,
    })
  }

  private logException(exception: unknown, status: number, method: string, path: string, message: string) {
    const context = `${method} ${path}`
    const stack = exception instanceof Error ? exception.stack : undefined

    if (status >= 500) {
      this.logger.error(`[${status}] ${message} @ ${context}`, stack)
      return
    }

    if (status >= 400 && !(exception instanceof BusinessException || exception instanceof HttpException)) {
      this.logger.warn(`[${status}] ${message} @ ${context}`)
    }
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
