import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { DatabaseService } from '../../core/database.service';
import { SessionGuard } from '../../core/session.guard';
import { fail } from '../../core/errors';
import { AIService } from './ai.service';
import { aiPreferenceInputSchema, apiKeyInputSchema, connectionPatchSchema, newApiKeyInputSchema } from './ai.dto';

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

  @Get('connections')
  listConnections(@Req() request: AuthenticatedRequest) {
    return this.ai.listConnections(request.user.id);
  }

  @Post('connections')
  @HttpCode(201)
  addConnection(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = newApiKeyInputSchema.safeParse(body);
    if (!parsed.success) fail(400, 'VALIDATION_FAILED', 'Informe uma chave válida.');
    return this.ai.addConnection(request.user.id, parsed.data.apiKey, parsed.data.label);
  }

  @Patch('connections/:id')
  updateConnection(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = connectionPatchSchema.safeParse(body);
    if (!parsed.success) fail(400, 'VALIDATION_FAILED', 'Os dados da chave são inválidos.');
    return this.ai.updateConnection(request.user.id, id, parsed.data);
  }

  @Delete('connections/:id')
  @HttpCode(204)
  async removeConnectionById(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.ai.removeConnection(request.user.id, id);
  }

  @Post('connections/:id/checks')
  @HttpCode(202)
  async checkConnectionById(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const workspaceId = await this.personalWorkspace(request.user.id);
    return { job: await this.ai.queueConnectionCheck(request.user.id, workspaceId, idempotencyKey, id) };
  }

  @Post('connections/:id/usage')
  @HttpCode(200)
  refreshUsage(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.ai.refreshUsage(request.user.id, id);
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

  @Get('preferences')
  getPreference(@Req() request: AuthenticatedRequest) {
    return this.ai.getPreference(request.user.id);
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
