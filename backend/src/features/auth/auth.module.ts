import { Module } from '@nestjs/common';
import { AuthController, ProfileController } from './auth.controller';
import { AuthMailerService } from './auth-mailer.service';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController, ProfileController],
  providers: [AuthService, AuthMailerService],
  exports: [AuthService],
})
export class AuthModule {}
