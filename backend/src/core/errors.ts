import { HttpException } from '@nestjs/common';

export class ApiException extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: number,
    readonly details?: unknown,
  ) {
    super(message, status);
  }
}

export function fail(status: number, code: string, message: string, details?: unknown): never {
  throw new ApiException(code, message, status, details);
}
