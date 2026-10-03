import { Module } from '@nestjs/common';
import { EntitlementsController, PlansController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({ controllers: [PlansController, EntitlementsController], providers: [BillingService], exports: [BillingService] })
export class BillingModule {}
