import {
  Controller, Delete, Get, Headers, HttpCode, Param, Post, Query, Req, Res,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { SessionGuard } from '../../core/session.guard';
import { DocumentsService } from './documents.service';

const MAX_UPLOAD_BYTES = (() => {
  const value = Number(process.env.UPLOAD_MAX_BYTES ?? 20_000_000);
  return Number.isSafeInteger(value) ? Math.min(Math.max(value, 1_000_000), 25_000_000) : 20_000_000;
})();

type AuthenticatedRequest = { user: { id: string }; ip?: string; socket?: { remoteAddress?: string } };

@Controller()
@UseGuards(SessionGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('materials/:id/documents')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 } }))
  async upload(
    @Req() request: AuthenticatedRequest,
    @Param('id') materialId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number } | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const accepted = await this.documents.upload(request.user.id, materialId, file, idempotencyKey, ip);
    return { document: accepted.document, job: accepted.job };
  }

  @Get('materials/:id/documents')
  listForMaterial(@Req() request: AuthenticatedRequest, @Param('id') materialId: string, @Query('cursor') cursor?: string) {
    return this.documents.listForMaterial(request.user.id, materialId, cursor);
  }

  @Get('documents/:id')
  async get(@Req() request: AuthenticatedRequest, @Param('id') documentId: string) {
    return { document: await this.documents.get(request.user.id, documentId) };
  }

  @Get('documents/:id/content')
  async download(@Req() request: AuthenticatedRequest, @Param('id') documentId: string, @Res() response: Response): Promise<void> {
    const file = await this.documents.download(request.user.id, documentId);
    const encodedName = encodeURIComponent(file.name).replace(/['()]/g, (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`);
    response.status(200);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="documento"; filename*=UTF-8''${encodedName}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(file.buffer);
  }

  @Delete('documents/:id')
  @HttpCode(202)
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('id') documentId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return { job: await this.documents.requestDelete(request.user.id, documentId, idempotencyKey) };
  }

  @Post('documents/:id/reprocessing')
  @HttpCode(202)
  async reprocess(
    @Req() request: AuthenticatedRequest,
    @Param('id') documentId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return { job: await this.documents.reprocess(request.user.id, documentId, idempotencyKey) };
  }
}
