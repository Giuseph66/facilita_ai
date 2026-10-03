import { Module } from '@nestjs/common';
import { AIController } from './ai/ai.controller';
import { AIService } from './ai/ai.service';
import { CredentialsVaultService } from './ai/credentials-vault.service';
import { FakeAIProvider } from './ai/fake-ai.provider';
import { JobHandlerRegistry } from './ai/job-handler.registry';
import { JobRunnerService } from './ai/job-runner.service';
import { JobsController } from './ai/jobs.controller';
import { JobsService } from './ai/jobs.service';
import { OllamaCloudProvider } from './ai/ollama-cloud.provider';
import { AssessmentsController, CourseAssessmentsController, StudyBlueprintsController } from './assessments/assessments.controller';
import { AssessmentsService } from './assessments/assessments.service';
import { DocumentsController } from './documents/documents.controller';
import { DocumentParser } from './documents/document.parser';
import { DocumentsService } from './documents/documents.service';
import { ExportsController } from './exports/exports.controller';
import { ExportRenderer } from './exports/export-renderer';
import { ExportsService } from './exports/exports.service';
import { EmbeddingService } from './rag/embedding.service';
import { RagService } from './rag/rag.service';
import { IntelligencePrivacyService, INTELLIGENCE_PRIVACY_SERVICE } from './intelligence-privacy.service';
import { ConversationsController, PracticeAttemptsController, PracticeTestsController, StudyArtifactsController } from './study/study.controller';
import { StudyService } from './study/study.service';

@Module({
  controllers: [
    AIController, JobsController, DocumentsController,
    ConversationsController, StudyArtifactsController, PracticeTestsController, PracticeAttemptsController,
    CourseAssessmentsController, AssessmentsController, StudyBlueprintsController, ExportsController,
  ],
  providers: [
    JobHandlerRegistry, JobsService, JobRunnerService,
    CredentialsVaultService, OllamaCloudProvider, FakeAIProvider, AIService,
    DocumentParser, DocumentsService, EmbeddingService, RagService,
    StudyService, AssessmentsService, ExportRenderer, ExportsService,
    IntelligencePrivacyService,
    { provide: INTELLIGENCE_PRIVACY_SERVICE, useExisting: IntelligencePrivacyService },
  ],
  exports: [
    DocumentsService, StudyService, JobsService, JobRunnerService, ExportsService,
    IntelligencePrivacyService, INTELLIGENCE_PRIVACY_SERVICE,
  ],
})
export class IntelligenceModule {}
