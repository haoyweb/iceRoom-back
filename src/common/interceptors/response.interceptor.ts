import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import type { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import type { ApiResponse } from '../dto/api-response.dto'
import { ErrorCode } from '../errors/error-code.enum'

interface RequestLike {
  originalUrl?: string
  url?: string
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<RequestLike>()
    const path = request.originalUrl ?? request.url ?? ''

    return next.handle().pipe(
      map((data) => ({
        code: ErrorCode.SUCCESS,
        message: 'success',
        data: data ?? null,
        timestamp: new Date().toISOString(),
        path,
      })),
    )
  }
}
