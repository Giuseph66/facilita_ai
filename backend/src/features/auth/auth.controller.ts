import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { sessionCookieName, sessionCookieOptions } from '../../core/cookies';
import { Public } from '../../core/public.decorator';
import {
  loginSchema,
  parseDto,
  passwordResetSchema,
  profilePatchSchema,
  recoverySchema,
  registerSchema,
} from './auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() body: unknown, @Req() request: any, @Res({ passthrough: true }) response: any) {
    const result = await this.auth.register(parseDto(registerSchema, body), request);
    this.setSessionCookie(response, result.token, result.maxAgeMs);
    return result.session;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown, @Req() request: any, @Res({ passthrough: true }) response: any) {
    const result = await this.auth.login(parseDto(loginSchema, body), request);
    this.setSessionCookie(response, result.token, result.maxAgeMs);
    return result.session;
  }

  @Get('session')
  getSession(@Req() request: any) {
    return this.auth.getSession(request);
  }

  @Delete('session')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: any, @Res({ passthrough: true }) response: any): Promise<void> {
    await this.auth.logout(request);
    response.clearCookie(sessionCookieName(), sessionCookieOptions() as any);
  }

  @Public()
  @Post('password-recovery')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordRecovery(@Body() body: unknown, @Req() request: any) {
    const input = parseDto(recoverySchema, body);
    await this.auth.requestPasswordRecovery(input.email, request);
    return { accepted: true };
  }

  @Public()
  @Post('password-reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() body: unknown, @Req() request: any): Promise<void> {
    const input = parseDto(passwordResetSchema, body);
    await this.auth.resetPassword(input.token, input.password, request);
  }

  private setSessionCookie(response: any, token: string, maxAgeMs: number): void {
    response.cookie(sessionCookieName(), token, sessionCookieOptions(maxAgeMs) as any);
  }
}

@Controller('me')
export class ProfileController {
  constructor(private readonly auth: AuthService) {}

  @Patch('profile')
  async patchProfile(@Body() body: unknown, @Req() request: any) {
    return this.auth.patchProfile(request.user.id, parseDto(profilePatchSchema, body));
  }

}
