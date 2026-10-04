import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { AcademicService } from './academic.service';
import {
  classInputSchema,
  classPatchSchema,
  courseInputSchema,
  coursePatchSchema,
  enrollmentInputSchema,
  invitationInputSchema,
  materialInputSchema,
  materialReleaseInputSchema,
  parseDto,
  parseUuid,
} from './academic.dto';

type RequestWithUser = { user: { id: string }; ip?: string; socket?: { remoteAddress?: string }; requestId?: string };

@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly academic: AcademicService) {}

  @Get()
  list(@Req() request: RequestWithUser, @Query('cursor') cursor?: string) {
    return this.academic.workspaces(request.user.id, cursor);
  }

  @Get(':workspaceId/courses')
  listCourses(@Req() request: RequestWithUser, @Param('workspaceId') workspaceId: string, @Query('cursor') cursor?: string) {
    return this.academic.listCourses(request.user.id, parseUuid(workspaceId), cursor);
  }

  @Post(':workspaceId/courses')
  createCourse(@Req() request: RequestWithUser, @Param('workspaceId') workspaceId: string, @Body() body: unknown) {
    return this.academic.createCourse(request.user.id, parseUuid(workspaceId), parseDto(courseInputSchema, body), request.requestId);
  }
}

@Controller('me')
export class MyCoursesController {
  constructor(private readonly academic: AcademicService) {}

  @Get('courses')
  listCourses(@Req() request: RequestWithUser, @Query('cursor') cursor?: string) {
    return this.academic.listAccessibleCourses(request.user.id, cursor);
  }
}

@Controller('courses')
export class CourseController {
  constructor(private readonly academic: AcademicService) {}

  @Get(':courseId')
  get(@Req() request: RequestWithUser, @Param('courseId') courseId: string) {
    return this.academic.getCourse(request.user.id, parseUuid(courseId));
  }

  @Patch(':courseId')
  patch(@Req() request: RequestWithUser, @Param('courseId') courseId: string, @Body() body: unknown) {
    return this.academic.patchCourse(request.user.id, parseUuid(courseId), parseDto(coursePatchSchema, body), request.requestId);
  }

  @Get(':courseId/classes')
  listClasses(@Req() request: RequestWithUser, @Param('courseId') courseId: string, @Query('cursor') cursor?: string) {
    return this.academic.listCourseClasses(request.user.id, parseUuid(courseId), cursor);
  }

  @Post(':courseId/classes')
  createClass(@Req() request: RequestWithUser, @Param('courseId') courseId: string, @Body() body: unknown) {
    return this.academic.createClass(request.user.id, parseUuid(courseId), parseDto(classInputSchema, body), request.requestId);
  }

  @Get(':courseId/materials')
  listMaterials(@Req() request: RequestWithUser, @Param('courseId') courseId: string, @Query('cursor') cursor?: string) {
    return this.academic.listMaterials(request.user.id, parseUuid(courseId), cursor);
  }

  @Post(':courseId/materials')
  createMaterial(@Req() request: RequestWithUser, @Param('courseId') courseId: string, @Body() body: unknown) {
    return this.academic.createMaterial(request.user.id, parseUuid(courseId), parseDto(materialInputSchema, body), request.requestId);
  }
}

@Controller('classes')
export class ClassController {
  constructor(private readonly academic: AcademicService) {}

  @Get()
  list(@Req() request: RequestWithUser, @Query('cursor') cursor?: string) {
    return this.academic.listClasses(request.user.id, cursor);
  }

  @Get(':classId')
  get(@Req() request: RequestWithUser, @Param('classId') classId: string) {
    return this.academic.getClass(request.user.id, parseUuid(classId));
  }

  @Patch(':classId')
  patch(@Req() request: RequestWithUser, @Param('classId') classId: string, @Body() body: unknown) {
    return this.academic.patchClass(request.user.id, parseUuid(classId), parseDto(classPatchSchema, body), request.requestId);
  }

  @Post(':classId/invitations')
  createInvitation(@Req() request: RequestWithUser, @Param('classId') classId: string, @Body() body: unknown) {
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    return this.academic.createInvitation(request.user.id, parseUuid(classId), parseDto(invitationInputSchema, body), ip, request.requestId);
  }

  @Delete(':classId/enrollments/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeEnrollment(@Req() request: RequestWithUser, @Param('classId') classId: string, @Param('userId') userId: string): Promise<void> {
    await this.academic.leaveOrRevoke(request.user.id, parseUuid(classId), parseUuid(userId), request.requestId);
  }
}

@Controller('enrollments')
export class EnrollmentController {
  constructor(private readonly academic: AcademicService) {}

  @Post()
  enroll(@Req() request: RequestWithUser, @Body() body: unknown) {
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const input = parseDto(enrollmentInputSchema, body);
    return this.academic.enroll(request.user.id, input.code, ip, request.requestId);
  }
}

@Controller('materials')
export class MaterialController {
  constructor(private readonly academic: AcademicService) {}

  @Put(':materialId/classes/:classId')
  release(@Req() request: RequestWithUser, @Param('materialId') materialId: string, @Param('classId') classId: string, @Body() body: unknown) {
    const input = parseDto(materialReleaseInputSchema, body);
    return this.academic.releaseMaterial(request.user.id, parseUuid(materialId), parseUuid(classId), input.revision, request.requestId);
  }

  @Delete(':materialId/classes/:classId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Req() request: RequestWithUser, @Param('materialId') materialId: string, @Param('classId') classId: string): Promise<void> {
    await this.academic.revokeMaterial(request.user.id, parseUuid(materialId), parseUuid(classId), request.requestId);
  }
}
