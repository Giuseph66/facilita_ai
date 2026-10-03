import { Body, Controller, Delete, Get, Headers, HttpCode, Post, Put, Req, UseGuards } from '@nestjs/common';
import { DatabaseService } from '../../core/database.service';
import { SessionGuard } from '../../core/session.guard';
import { fail } from '../../core/errors';
import { AIService } from './ai.service';
import { aiPreferenceInputSchema, apiKeyInputSchema } from './ai.dto';

type AuthenticatedRequest = { user: { id: string } };

@Controller('ai')
@UseGuards(SessionGuard)
export class AIController {
  constructor(private readonly ai: AIService, private readonly db: DatabaseService) {}

  @Get('connections/ollama')
  getConnection(@Req() request: AuthenticatedRequest) {
    return this.ai.getConnection(request.user.id);
  }

  @Put('connections/ollama')
  saveConnection(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = apiKeyInputSchema.safeParse(body);
    if (!parsed.success) fail(400, 'VALIDATION_FAILED', 'Informe uma chave válida.');
    return this.ai.saveConnection(request.user.id, parsed.data.apiKey);
  }

  @Delete('connections/ollama')
  @HttpCode(204)
  async removeConnection(@Req() request: AuthenticatedRequest): Promise<void> {
    await this.ai.removeConnection(request.user.id);
  }

  @Post('connections/ollama/checks')
  @HttpCode(202)
  async checkConnection(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const workspaceId = await this.personalWorkspace(request.user.id);
    return { job: await this.ai.queueConnectionCheck(request.user.id, workspaceId, idempotencyKey) };
  }

  @Get('models')
  listModels(@Req() request: AuthenticatedRequest) {
    return this.ai.listModels(request.user.id);
  }

  @Put('preferences')
  setPreference(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = aiPreferenceInputSchema.safeParse(body);
    if (!parsed.success) fail(400, 'VALIDATION_FAILED', 'A preferência de IA é inválida.');
    return this.ai.setPreference(request.user.id, parsed.data.mode, parsed.data.preferredModel);
  }

  private async personalWorkspace(actorId: string): Promise<string> {
    const rows = await this.db.asActor(actorId, (connection) =>
      connection.query<{ id: string }>(
        `SELECT id FROM workspaces WHERE owner_user_id = $1 AND type = 'PERSONAL' LIMIT 1`, [actorId],
      ),
    );
    if (!rows[0]) fail(404, 'RESOURCE_NOT_FOUND', 'O espaço pessoal não está disponível.');
    return rows[0].id;
  }
}
