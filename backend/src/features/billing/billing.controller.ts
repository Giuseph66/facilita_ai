import { Controller, Get, Query, Req } from '@nestjs/common';
import { Public } from '../../core/public.decorator';
import { BillingService } from './billing.service';
import { parseUsageQuery } from './billing.dto';

@Controller('plans')
export class PlansController {
  constructor(private readonly billing: BillingService) {}

  @Public()
  @Get()
  list() {
    return this.billing.plans();
  }
}

@Controller('me')
export class EntitlementsController {
  constructor(private readonly billing: BillingService) {}

  @Get('entitlements')
  entitlements(@Req() request: { user: { id: string } }) {
    return this.billing.entitlements(request.user.id);
  }

  @Get('usage')
  usage(@Req() request: { user: { id: string } }, @Query() query: unknown) {
    return this.billing.usage(request.user.id, parseUsageQuery(query).period);
  }
}
