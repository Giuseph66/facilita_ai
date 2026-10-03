import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../core/session.guard';
import { fail } from '../../core/errors';
import {
  assessmentCopyInputSchema, assessmentGenerationInputSchema, assessmentInputSchema,
  assessmentPatchSchema, assessmentQuestionsInputSchema, blueprintInputSchema, blueprintPublicationSchema,
} from './assessments.dto';
import { AssessmentsService } from './assessments.service';

type AuthenticatedRequest = { user: { id: string } };

function parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) fail(400, 'VALIDATION_FAILED', 'Os dados informados são inválidos.');
  return result.data;
}

@Controller('courses/:courseId/assessments')
@UseGuards(SessionGuard)
export class CourseAssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Param('courseId') courseId: string, @Query('cursor') cursor?: string) {
    return this.assessments.list(request.user.id, courseId, cursor);
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Param('courseId') courseId: string, @Body() body: unknown) {
    return { assessment: await this.assessments.create(request.user.id, courseId, parse(assessmentInputSchema, body)) };
  }
}

@Controller('assessments')
@UseGuards(SessionGuard)
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Get(':id')
  async get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { assessment: await this.assessments.get(request.user.id, id) };
  }

  @Patch(':id')
  async patch(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return { assessment: await this.assessments.patch(request.user.id, id, parse(assessmentPatchSchema, body)) };
  }

  @Put(':id/questions')
  async questions(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return { assessment: await this.assessments.replaceQuestions(request.user.id, id, parse(assessmentQuestionsInputSchema, body)) };
  }

  @Post(':id/generations')
  @HttpCode(202)
  async generate(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return { job: await this.assessments.generate(request.user.id, id, parse(assessmentGenerationInputSchema, body), idempotencyKey) };
  }

  @Post(':id/copies')
  async copy(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return { assessment: await this.assessments.copy(request.user.id, id, parse(assessmentCopyInputSchema, body)) };
  }
}

@Controller('classes/:classId/study-blueprint')
@UseGuards(SessionGuard)
export class StudyBlueprintsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest, @Param('classId') classId: string) {
    return this.assessments.getBlueprint(request.user.id, classId);
  }

  @Put()
  async save(@Req() request: AuthenticatedRequest, @Param('classId') classId: string, @Body() body: unknown) {
    return { blueprint: await this.assessments.saveBlueprint(request.user.id, classId, parse(blueprintInputSchema, body)) };
  }

  @Post('publications')
  async publish(@Req() request: AuthenticatedRequest, @Param('classId') classId: string, @Body() body: unknown) {
    return { blueprint: await this.assessments.publishBlueprint(request.user.id, classId, parse(blueprintPublicationSchema, body)) };
  }
}
