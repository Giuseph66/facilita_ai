import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../core/session.guard';
import { fail } from '../../core/errors';
import { StudyService } from './study.service';
import { conversationInputSchema, messageInputSchema, practiceSubmissionSchema, studyArtifactInputSchema } from './study.dto';

type AuthenticatedRequest = { user: { id: string } };

function parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) fail(400, 'VALIDATION_FAILED', 'Os dados informados são inválidos.');
  return result.data;
}

@Controller('conversations')
@UseGuards(SessionGuard)
export class ConversationsController {
  constructor(private readonly study: StudyService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.study.createConversation(request.user.id, parse(conversationInputSchema, body));
  }

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query('courseId') courseId?: string, @Query('cursor') cursor?: string) {
    return this.study.listConversations(request.user.id, courseId, cursor);
  }

  @Get(':id/messages')
  messages(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Query('cursor') cursor?: string) {
    return this.study.listMessages(request.user.id, id, cursor);
  }

  @Post(':id/messages')
  @HttpCode(202)
  async sendMessage(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return { job: await this.study.sendMessage(request.user.id, id, parse(messageInputSchema, body), idempotencyKey) };
  }
}

@Controller('study/artifacts')
@UseGuards(SessionGuard)
export class StudyArtifactsController {
  constructor(private readonly study: StudyService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query('courseId') courseId?: string,
    @Query('kind') kind?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.study.listArtifacts(request.user.id, courseId, kind, cursor);
  }

  @Post()
  @HttpCode(202)
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return { job: await this.study.createArtifact(request.user.id, parse(studyArtifactInputSchema, body), idempotencyKey) };
  }

  @Get(':id')
  async get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { artifact: await this.study.getArtifact(request.user.id, id) };
  }
}

@Controller('practice-tests')
@UseGuards(SessionGuard)
export class PracticeTestsController {
  constructor(private readonly study: StudyService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query('cursor') cursor?: string) {
    return this.study.listPracticeTests(request.user.id, cursor);
  }

  @Get(':id')
  async get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { practiceTest: await this.study.getPracticeTest(request.user.id, id) };
  }

  @Post(':id/attempts')
  @HttpCode(201)
  async createAttempt(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { attempt: await this.study.createAttempt(request.user.id, id) };
  }
}

@Controller('practice-attempts')
@UseGuards(SessionGuard)
export class PracticeAttemptsController {
  constructor(private readonly study: StudyService) {}

  @Post(':id/submission')
  @HttpCode(200)
  async submit(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    const parsed = parse(practiceSubmissionSchema, body);
    return { attempt: await this.study.submitAttempt(request.user.id, id, parsed.answers) };
  }
}
