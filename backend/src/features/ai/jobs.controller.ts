import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../core/session.guard';
import { JobsService } from './jobs.service';

type AuthenticatedRequest = { user: { id: string } };

@Controller('jobs')
@UseGuards(SessionGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get(':id')
  async get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { job: await this.jobs.get(request.user.id, id) };
  }
}
