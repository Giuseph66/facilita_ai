import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { sessionCookieName, sessionCookieOptions } from '../../core/cookies';
import { PrivacyService } from './privacy.service';
import { parsePrivacyRequest } from './privacy.dto';

type AuthenticatedRequest = { user: { id: string }; requestId?: string };

@Controller('me/privacy-requests')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.privacy.list(request.user.id);
  }

  @Post()
  @HttpCode(202)
  async create(@Req() request: AuthenticatedRequest, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await this.privacy.createRequest(request.user.id, parsePrivacyRequest(body), request.requestId);
    if (result.type === 'DELETE_ACCOUNT') response.clearCookie(sessionCookieName(), sessionCookieOptions() as any);
    return result;
  }

  @Get(':requestId/export')
  async export(@Req() request: AuthenticatedRequest, @Param('requestId') requestId: string, @Res() response: Response): Promise<void> {
    const content = await this.privacy.getExport(request.user.id, requestId);
    response.status(200);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="facilita-estudo-export.json"');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(content);
  }
}
