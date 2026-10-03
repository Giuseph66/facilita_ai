import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseService, QueryConnection } from '../../core/database.service';
import { RateLimitService } from '../../core/rate-limit.service';
import { fail } from '../../core/errors';
import { sessionCookieName } from '../../core/cookies';
import { AuthMailerService } from './auth-mailer.service';
import { LoginInput, Persona, RegisterInput, SessionView } from './auth.dto';

type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
  user?: { id: string; name: string; email: string; defaultPersona: Persona };
};

const FREE_PLAN_ID = '00000000-0000-4000-8000-000000000001';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly rateLimit: RateLimitService,
    private readonly mailer: AuthMailerService,
  ) {}

  async register(input: RegisterInput, request: RequestLike): Promise<{ session: SessionView; token: string; maxAgeMs: number }> {
    const ip = this.ip(request);
    await this.rateLimit.enforce('auth.register.ip', ip, 8, 3600);
    await this.rateLimit.enforce('auth.register.email', input.email, 3, 3600);
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const passwordHash = await this.hashPassword(input.password);
    const session = this.newSession(userId);

    try {
      await this.db.asActor(userId, async (connection) => {
        await connection.query(
          `INSERT INTO users (id, email_normalized, name, password_hash, default_persona, status)
           VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
          [userId, input.email, input.name, passwordHash, input.persona],
        );
        await connection.query(
          `INSERT INTO workspaces (id, type, name, owner_user_id)
           VALUES ($1, 'PERSONAL', $2, $3)`,
          [workspaceId, 'Espaço de ' + input.name, userId],
        );
        await connection.query(
          `INSERT INTO workspace_memberships (workspace_id, user_id, status) VALUES ($1, $2, 'ACTIVE')`,
          [workspaceId, userId],
        );
        await connection.query(
          `INSERT INTO workspace_roles (workspace_id, user_id, role) VALUES ($1, $2, $3)`,
          [workspaceId, userId, input.persona],
        );
        const account = await connection.query<{ id: string }>(
          `INSERT INTO billing_accounts (owner_user_id) VALUES ($1) RETURNING id`, [userId],
        );
        await connection.query(
          `INSERT INTO subscriptions (account_id, plan_id, state, period_start, period_end)
           VALUES ($1, $2, 'ACTIVE', date_trunc('month', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc',
                   (date_trunc('month', now() AT TIME ZONE 'utc') + interval '1 month') AT TIME ZONE 'utc')`,
          [account[0].id, FREE_PLAN_ID],
        );
        await this.insertSession(connection, session);
        await connection.query(
          `INSERT INTO audit_events (actor_id, action, resource_type, resource_id, workspace_id)
           VALUES ($1, 'ACCOUNT_REGISTERED', 'user', $1, $2)`,
          [userId, workspaceId],
        );
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        fail(409, 'ACCOUNT_UNAVAILABLE', 'Não foi possível criar uma conta com esses dados.');
      }
      throw error;
    }

    const profile = { id: userId, name: input.name, email: input.email, defaultPersona: input.persona };
    const workspaces = [{ id: workspaceId, name: 'Espaço de ' + input.name, roles: [input.persona] as Persona[] }];
    return { session: { user: profile, workspaces, csrfToken: session.csrfToken }, token: session.token, maxAgeMs: session.maxAgeMs };
  }

  async login(input: LoginInput, request: RequestLike): Promise<{ session: SessionView; token: string; maxAgeMs: number }> {
    const ip = this.ip(request);
    await this.rateLimit.enforce('auth.login.ip', ip, 12, 900);
    await this.rateLimit.enforce('auth.login.email', input.email, 8, 900);
    const rows = await this.db.query<{
      id: string;
      name: string;
      email_normalized: string;
      password_hash: string;
      default_persona: Persona;
    }>(
      `SELECT id, name, email_normalized, password_hash, default_persona
       FROM users WHERE email_normalized = $1 AND status = 'ACTIVE'`,
      [input.email],
    );
    const user = rows[0];
    const verified = user ? await argon2.verify(user.password_hash, input.password).catch(() => false) : false;
    if (!user || !verified) fail(401, 'INVALID_CREDENTIALS', 'Email ou senha inválidos.');

    const oldToken = this.readSessionToken(request);
    const session = this.newSession(user.id);
    await this.db.asActor(user.id, async (connection) => {
      if (oldToken) {
        await connection.query(
          `UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL`,
          [this.sha256(oldToken), user.id],
        );
      }
      await this.insertSession(connection, session);
      await connection.query(
        `INSERT INTO audit_events (actor_id, action, resource_type, resource_id)
         VALUES ($1, 'LOGIN', 'user', $1)`, [user.id],
      );
    });
    const workspaces = await this.loadWorkspaces(user.id);
    return {
      session: {
        user: { id: user.id, name: user.name, email: user.email_normalized, defaultPersona: user.default_persona },
        workspaces,
        csrfToken: session.csrfToken,
      },
      token: session.token,
      maxAgeMs: session.maxAgeMs,
    };
  }

  async getSession(request: RequestLike): Promise<SessionView> {
    if (!request.user) fail(401, 'UNAUTHENTICATED', 'Entre na sua conta para continuar.');
    const token = this.readSessionToken(request);
    if (!token) fail(401, 'UNAUTHENTICATED', 'Entre na sua conta para continuar.');
    const csrfToken = this.csrfFor(token);
    const result = await this.db.query<{ id: string }>(
      `UPDATE sessions SET csrf_token_hash = $2, last_seen_at = now()
       WHERE token_hash = $1 AND user_id = $3 AND revoked_at IS NULL
         AND expires_at > now() AND absolute_expires_at > now()
       RETURNING id`,
      [this.sha256(token), this.sha256(csrfToken), request.user.id],
    );
    if (!result[0]) fail(401, 'UNAUTHENTICATED', 'Entre na sua conta para continuar.');
    const workspaces = await this.loadWorkspaces(request.user.id);
    return { user: request.user, workspaces, csrfToken };
  }

  async logout(request: RequestLike): Promise<void> {
    const token = this.readSessionToken(request);
    if (!token || !request.user) return;
    await this.db.asActor(request.user.id, async (connection) => {
      await connection.query(
        `UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL`,
        [this.sha256(token), request.user!.id],
      );
      await connection.query(
        `INSERT INTO audit_events (actor_id, action, resource_type, resource_id)
         VALUES ($1, 'LOGOUT', 'user', $1)`, [request.user!.id],
      );
    });
  }

  async requestPasswordRecovery(email: string, request: RequestLike): Promise<void> {
    await this.rateLimit.enforce('auth.recovery.ip', this.ip(request), 5, 3600);
    await this.rateLimit.enforce('auth.recovery.email', email, 3, 3600);
    const users = await this.db.query<{ id: string; email_normalized: string }>(
      `SELECT id, email_normalized FROM users WHERE email_normalized = $1 AND status = 'ACTIVE'`, [email],
    );
    if (!users[0]) return;
    const token = this.randomToken();
    const tokenHash = this.sha256(token);
    await this.db.transaction(async (connection) => {
      await connection.query(
        `UPDATE account_tokens SET consumed_at = now()
         WHERE user_id = $1 AND purpose = 'PASSWORD_RECOVERY' AND consumed_at IS NULL`, [users[0].id],
      );
      await connection.query(
        `INSERT INTO account_tokens (user_id, purpose, token_hash, expires_at)
         VALUES ($1, 'PASSWORD_RECOVERY', $2, now() + interval '30 minutes')`, [users[0].id, tokenHash],
      );
    });
    try {
      const sent = await this.mailer.sendPasswordRecovery(users[0].email_normalized, token);
      if (!sent) await this.consumeRecoveryToken(tokenHash);
    } catch {
      await this.consumeRecoveryToken(tokenHash);
    }
  }

  async resetPassword(token: string, password: string, request: RequestLike): Promise<void> {
    await this.rateLimit.enforce('auth.reset.ip', this.ip(request), 8, 3600);
    const passwordHash = await this.hashPassword(password);
    await this.db.transaction(async (connection) => {
      const rows = await connection.query<{ id: string; user_id: string }>(
        `SELECT t.id, t.user_id FROM account_tokens t JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = $1 AND t.purpose = 'PASSWORD_RECOVERY' AND t.consumed_at IS NULL
           AND t.expires_at > now() AND u.status = 'ACTIVE' FOR UPDATE OF t`,
        [this.sha256(token)],
      );
      const accountToken = rows[0];
      if (!accountToken) fail(400, 'TOKEN_INVALID_OR_EXPIRED', 'O link expirou ou já foi utilizado.');
      await connection.query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [accountToken.user_id, passwordHash]);
      await connection.query(`UPDATE account_tokens SET consumed_at = now() WHERE id = $1`, [accountToken.id]);
      await connection.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [accountToken.user_id]);
    });
  }

  async patchProfile(userId: string, patch: { name?: string }): Promise<{ id: string; name: string; email: string; defaultPersona: Persona }> {
    const result = await this.db.asActor(userId, async (connection) => {
      const rows = await connection.query<{ id: string; name: string; email_normalized: string; default_persona: Persona }>(
        `UPDATE users SET name = COALESCE($2, name), updated_at = now()
         WHERE id = $1 AND status = 'ACTIVE' RETURNING id, name, email_normalized, default_persona`,
        [userId, patch.name ?? null],
      );
      if (!rows[0]) fail(404, 'RESOURCE_NOT_FOUND', 'Conta não encontrada.');
      await connection.query(
        `INSERT INTO audit_events (actor_id, action, resource_type, resource_id)
         VALUES ($1, 'PROFILE_UPDATED', 'user', $1)`, [userId],
      );
      return rows[0];
    });
    return { id: result.id, name: result.name, email: result.email_normalized, defaultPersona: result.default_persona };
  }

  private async loadWorkspaces(userId: string): Promise<SessionView['workspaces']> {
    const rows = await this.db.asActor(userId, (connection) => connection.query<{
      id: string;
      name: string;
      roles: Persona[];
    }>(
      `SELECT w.id, w.name, COALESCE(array_agg(r.role ORDER BY r.role) FILTER (WHERE r.role IS NOT NULL), ARRAY[]::text[]) AS roles
       FROM workspace_memberships m JOIN workspaces w ON w.id = m.workspace_id
       LEFT JOIN workspace_roles r ON r.workspace_id = w.id AND r.user_id = m.user_id
       WHERE m.user_id = $1 AND m.status = 'ACTIVE'
       GROUP BY w.id, w.name ORDER BY w.created_at, w.id`,
      [userId],
    ));
    return rows.map((row) => ({ id: row.id, name: row.name, roles: row.roles }));
  }

  private newSession(userId: string): { id: string; userId: string; token: string; tokenHash: string; csrfToken: string; csrfTokenHash: string; maxAgeMs: number; expiresAt: Date; absoluteExpiresAt: Date } {
    const idleSeconds = this.envSeconds('SESSION_IDLE_TTL_SECONDS', 7 * 24 * 60 * 60, 'SESSION_IDLE_SECONDS');
    const absoluteSeconds = this.envSeconds('SESSION_ABSOLUTE_TTL_SECONDS', 30 * 24 * 60 * 60, 'SESSION_ABSOLUTE_SECONDS');
    const now = Date.now();
    const absoluteExpiresAt = new Date(now + absoluteSeconds * 1000);
    const expiresAt = new Date(Math.min(now + idleSeconds * 1000, absoluteExpiresAt.getTime()));
    const token = this.randomToken();
    const csrfToken = this.csrfFor(token);
    return {
      id: randomUUID(), userId, token, tokenHash: this.sha256(token), csrfToken, csrfTokenHash: this.sha256(csrfToken),
      maxAgeMs: expiresAt.getTime() - now, expiresAt, absoluteExpiresAt,
    };
  }

  private async insertSession(connection: QueryConnection, session: ReturnType<AuthService['newSession']>): Promise<void> {
    await connection.query(
      `INSERT INTO sessions (id, user_id, token_hash, csrf_token_hash, expires_at, absolute_expires_at, authenticated_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
      [session.id, session.userId, session.tokenHash, session.csrfTokenHash, session.expiresAt, session.absoluteExpiresAt],
    );
  }

  private async consumeRecoveryToken(tokenHash: string): Promise<void> {
    await this.db.query(`UPDATE account_tokens SET consumed_at = now() WHERE token_hash = $1 AND consumed_at IS NULL`, [tokenHash]);
  }

  private async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  }

  private randomToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private csrfFor(sessionToken: string): string {
    return createHmac('sha256', sessionToken).update('facilita-estudo:csrf:v1').digest('base64url');
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private ip(request: RequestLike): string {
    return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
  }

  private envSeconds(name: string, fallback: number, legacyName?: string): number {
    const value = Number(process.env[name] ?? (legacyName ? process.env[legacyName] : undefined) ?? fallback);
    return Number.isInteger(value) && value >= 60 ? Math.min(value, 365 * 24 * 60 * 60) : fallback;
  }

  private readSessionToken(request: RequestLike): string | undefined {
    const name = sessionCookieName();
    const value = request.cookies?.[name];
    if (value) return value;
    const header = request.headers.cookie;
    if (typeof header !== 'string') return undefined;
    for (const item of header.split(';')) {
      const index = item.indexOf('=');
      if (index >= 0 && item.slice(0, index).trim() === name) {
        try { return decodeURIComponent(item.slice(index + 1).trim()); } catch { return undefined; }
      }
    }
    return undefined;
  }
}
