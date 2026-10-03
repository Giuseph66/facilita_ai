import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './core/public.decorator';
import { DatabaseService } from './core/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Public()
  @Get()
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Get('live')
  liveProbe() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async ready() {
    try {
      await this.db.checkReady();
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}
