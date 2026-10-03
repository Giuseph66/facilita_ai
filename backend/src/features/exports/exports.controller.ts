import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { fail } from '../../core/errors';
import { exportInputSchema } from './export.dto';
import { ExportsService } from './exports.service';

type AuthenticatedRequest = { user: { id: string } };

@Controller()
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Post('assessments/:id/exports')
  @HttpCode(202)
  async create(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key?: string) {
    const input = exportInputSchema.safeParse(body);
    if (!input.success) fail(400, 'VALIDATION_FAILED', 'Revise o formato, a revisão e o tipo de arquivo.');
    return { job: await this.exports.create(request.user.id, id, input.data, key) };
  }

  @Get('exports/:id')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.exports.get(request.user.id, id); }

  @Get('exports/:id/content')
  async download(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Res() response: Response): Promise<void> {
    const file = await this.exports.download(request.user.id, id);
    const encoded = encodeURIComponent(file.filename).replace(/['()]/g, value => `%${value.charCodeAt(0).toString(16).toUpperCase()}`);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="avaliacao.${file.mimeType === 'application/pdf' ? 'pdf' : 'html'}"; filename*=UTF-8''${encoded}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(file.buffer);
  }
}
