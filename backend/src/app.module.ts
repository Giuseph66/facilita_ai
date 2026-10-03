import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { OpenApiModule } from './contracts/openapi.module';
import { AcademicModule } from './features/academic/academic.module';
import { AuthModule } from './features/auth/auth.module';
import { BillingModule } from './features/billing/billing.module';
import { IntelligenceModule } from './features/intelligence.module';
import { PrivacyModule } from './features/privacy/privacy.module';
import { HealthController } from './health.controller';

@Module({
  imports: [CoreModule, AuthModule, AcademicModule, BillingModule, IntelligenceModule, PrivacyModule, OpenApiModule],
  controllers: [HealthController],
})
export class AppModule {}
