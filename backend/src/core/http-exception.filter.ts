import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiException } from './errors';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{ requestId?: string }>();
    const response = http.getResponse();
    const requestId = request.requestId ?? randomUUID();

    if (exception instanceof ApiException) {
      response.status(exception.getStatus()).json({
        code: exception.code,
        message: exception.message,
        ...(exception.details === undefined ? {} : { details: exception.details }),
        requestId,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = status === 400 ? 'VALIDATION_FAILED'
        : status === 401 ? 'UNAUTHENTICATED'
          : status === 403 ? 'FORBIDDEN'
            : status === 404 ? 'RESOURCE_NOT_FOUND'
              : status === 413 ? 'PAYLOAD_TOO_LARGE'
                : status === 415 ? 'UNSUPPORTED_MEDIA_TYPE'
                  : status === 429 ? 'RATE_LIMITED'
                    : status === 503 ? 'SERVICE_UNAVAILABLE' : 'REQUEST_FAILED';
      response.status(status).json({ code, message: 'A solicitação não pôde ser concluída.', requestId });
      return;
    }

    const internalCode = exception && typeof exception === 'object' && 'code' in exception
      && typeof exception.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(exception.code)
      ? exception.code : 'UNKNOWN';
    this.logger.error({ event: 'HTTP_INTERNAL_ERROR', requestId, errorCode: internalCode });
    response.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Ocorreu um erro interno.',
      requestId,
    });
  }
}
