import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import { DatabaseService } from './database.service';
import { fail } from './errors';
import { IS_PUBLIC_ROUTE } from './public.decorator';
import { sessionCookieName, sessionCookieOptions } from './cookies';
import { sameOrigin } from './startup-config';

type SessionRequest = {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
  protocol?: string;
  hostname?: string;
  get?: (name: string) => string | undefined;
  user?: { id: string; name: string; email: string; defaultPersona: string };
  requestId?: string;
};
type SessionResponse = { cookie?: (name: string, value: string, options: Record<string, unknown>) => void };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly db: DatabaseService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const response = context.switchToHttp().getResponse<SessionResponse>();
    if (isPublic) {
      if (this.isMutation(request.method)) this.assertSameOrigin(request);
      return true;
    }

    const token = request.cookies?.[sessionCookieName()] ?? this.readCookie(request.headers.cookie, sessionCookieName());
    if (!token || token.length > 256) fail(401, 'UNAUTHENTICATED', 'Entre na sua conta para continuar.');

    const tokenHash = this.sha256(token);
    const rows = await this.db.query<{
      id: string;
      user_id: string;
      csrf_token_hash: string;
      name: string;
      email_normalized: string;
      default_persona: string;
    }>(
      `SELECT s.id, s.user_id, s.csrf_token_hash, u.name, u.email_normalized, u.default_persona
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL
         AND s.expires_at > now() AND s.absolute_expires_at > now() AND u.status = 'ACTIVE'`,
      [tokenHash],
    );
    const session = rows[0];
    if (!session) fail(401, 'UNAUTHENTICATED', 'Entre na sua conta para continuar.');

    if (this.isMutation(request.method)) {
      this.assertSameOrigin(request);
      const csrf = request.headers['x-csrf-token'];
      if (typeof csrf !== 'string' || !this.constantTimeEqual(session.csrf_token_hash, this.sha256(csrf))) {
        fail(403, 'CSRF_INVALID', 'A sessão precisa ser atualizada antes desta alteração.');
      }
    }

    const idleSeconds = this.envSeconds('SESSION_IDLE_TTL_SECONDS', 7 * 24 * 60 * 60, 'SESSION_IDLE_SECONDS');
    const refreshed = await this.db.query<{ expires_at: Date }>(
      `UPDATE sessions SET last_seen_at = now(), expires_at = LEAST(now() + ($2 * interval '1 second'), absolute_expires_at)
       WHERE id = $1 AND revoked_at IS NULL AND expires_at > now() AND absolute_expires_at > now()
       RETURNING expires_at`, [session.id, idleSeconds],
    );
    if (!refreshed[0]) fail(401, 'UNAUTHENTICATED', 'Entre na sua conta para continuar.');
    response.cookie?.(
      sessionCookieName(), token,
      sessionCookieOptions(Math.max(0, new Date(refreshed[0].expires_at).getTime() - Date.now())),
    );

    request.user = {
      id: session.user_id,
      name: session.name,
      email: session.email_normalized,
      defaultPersona: session.default_persona,
    };
    return true;
  }

  private assertSameOrigin(request: SessionRequest): void {
    const origin = request.headers.origin;
    if (typeof origin !== 'string') fail(403, 'CSRF_INVALID', 'Origem da solicitação inválida.');
    const expected = process.env.APP_ORIGIN ?? (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:3000');
    if (!sameOrigin(origin, expected, process.env.NODE_ENV !== 'production')) {
      fail(403, 'CSRF_INVALID', 'Origem da solicitação inválida.');
    }
  }

  private isMutation(method: string): boolean {
    return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  }

  private envSeconds(name: string, fallback: number, legacyName?: string): number {
    const value = Number(process.env[name] ?? (legacyName ? process.env[legacyName] : undefined) ?? fallback);
    return Number.isSafeInteger(value) && value >= 60 ? Math.min(value, 365 * 24 * 60 * 60) : fallback;
  }

  private readCookie(header: string | string[] | undefined, name: string): string | undefined {
    if (typeof header !== 'string') return undefined;
    for (const pair of header.split(';')) {
      const index = pair.indexOf('=');
      if (index < 0 || pair.slice(0, index).trim() !== name) continue;
      try {
        return decodeURIComponent(pair.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private constantTimeEqual(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
