import { Module } from '@nestjs/common';
import { ClassController, CourseController, EnrollmentController, MaterialController, MyCoursesController, WorkspaceController } from './academic.controller';
import { AcademicService } from './academic.service';
import { IntelligenceModule } from '../intelligence.module';

@Module({
  imports: [IntelligenceModule],
  controllers: [WorkspaceController, MyCoursesController, CourseController, ClassController, EnrollmentController, MaterialController],
  providers: [AcademicService],
  exports: [AcademicService],
})
export class AcademicModule {}
