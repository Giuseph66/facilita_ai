import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JobRunnerService } from './features/ai/job-runner.service';
import { ExportsService } from './features/exports/exports.service';
import { PrivacyService } from './features/privacy/privacy.service';

async function bootstrapWorker(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const runner = app.get(JobRunnerService);
  const privacy = app.get(PrivacyService);
  const exportsService = app.get(ExportsService);
  try {
    privacy.startProcessor();
    exportsService.startCleanup();
    await runner.start();
  } catch (error) {
    privacy.stopProcessor();
    await exportsService.stopCleanup().catch(() => undefined);
    await runner.stop().catch(() => undefined);
    await app.close();
    throw error;
  }
  const shutdown = async () => {
    privacy.stopProcessor();
    await exportsService.stopCleanup();
    await runner.stop();
    await app.close();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

void bootstrapWorker().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : 'UnknownError';
  process.stderr.write(`Worker startup failed: ${name}\n`);
  process.exitCode = 1;
});
