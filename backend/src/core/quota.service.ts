import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, QueryConnection } from './database.service';
import { fail } from './errors';

type Entitlement = { value_type: string; value: unknown };
type Reservation = {
  id: string;
  operation_id: string;
  account_id: string;
  metric: string;
  amount: number;
  state: string;
  period_start: Date;
};

@Injectable()
export class QuotaService {
  constructor(private readonly db: DatabaseService) {}

  async require(userId: string, capability: string): Promise<void> {
    await this.db.asActor(userId, async (connection) => {
      const entitlement = await this.entitlement(connection, userId, capability);
      if (!entitlement) fail(403, 'CAPABILITY_REQUIRED', 'Este recurso não está disponível no plano atual.');
      if (entitlement.value_type === 'BOOLEAN' && entitlement.value !== true) {
        fail(403, 'CAPABILITY_REQUIRED', 'Este recurso não está disponível no plano atual.');
      }
      if (entitlement.value_type === 'LIMIT' && this.limitValue(entitlement) <= 0) {
        fail(403, 'CAPABILITY_REQUIRED', 'Este recurso não está disponível no plano atual.');
      }
    });
  }

  async reserve(userId: string, metric: string, operationId: string, amount = 1): Promise<void> {
    if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(metric) || !/^[a-zA-Z0-9._:-]{1,200}$/.test(operationId)) {
      fail(400, 'VALIDATION_FAILED', 'Identificador de uso inválido.');
    }
    if (!Number.isSafeInteger(amount) || amount < 1) {
      fail(400, 'VALIDATION_FAILED', 'Quantidade de uso inválida.');
    }

    await this.db.asActor(userId, async (connection) => {
      const account = await this.account(connection, userId);
      const entitlement = await this.entitlement(connection, userId, metric);
      if (!entitlement || entitlement.value_type !== 'LIMIT') {
        fail(403, 'CAPABILITY_REQUIRED', 'Este recurso não está disponível no plano atual.');
      }
      const limit = this.limitValue(entitlement);
      if (limit <= 0) fail(403, 'CAPABILITY_REQUIRED', 'Este recurso não está disponível no plano atual.');
      const period = this.period(entitlement);
      const start = await this.periodStart(connection, period);
      await connection.query(
        `INSERT INTO usage_counters (account_id, metric, period_start, used, reserved)
         VALUES ($1, $2, $3, 0, 0) ON CONFLICT (account_id, metric, period_start) DO NOTHING`,
        [account.id, metric, start],
      );
      const counters = await connection.query<{ used: number; reserved: number }>(
        `SELECT used, reserved FROM usage_counters
         WHERE account_id = $1 AND metric = $2 AND period_start = $3 FOR UPDATE`,
        [account.id, metric, start],
      );

      const expired = await connection.query<{ operation_id: string; amount: number }>(
        `UPDATE usage_reservations SET state = 'EXPIRED', updated_at = now()
         WHERE account_id = $1 AND metric = $2 AND period_start = $3
           AND state = 'RESERVED' AND expires_at <= now()
         RETURNING operation_id, amount`,
        [account.id, metric, start],
      );
      if (expired.length) {
        const expiredAmount = expired.reduce((total, row) => total + Number(row.amount), 0);
        await connection.query(
          `UPDATE usage_counters SET reserved = GREATEST(0, reserved - $4)
           WHERE account_id = $1 AND metric = $2 AND period_start = $3`,
          [account.id, metric, start, expiredAmount],
        );
        for (const row of expired) {
          await connection.query(
            `INSERT INTO usage_events (operation_id, account_id, metric, delta, reason)
             VALUES ($1, $2, $3, $4, 'EXPIRE') ON CONFLICT (operation_id, metric, reason) DO NOTHING`,
            [row.operation_id, account.id, metric, -Number(row.amount)],
          );
        }
        const refreshed = await connection.query<{ used: number; reserved: number }>(
          `SELECT used, reserved FROM usage_counters WHERE account_id = $1 AND metric = $2 AND period_start = $3`,
          [account.id, metric, start],
        );
        counters[0].used = refreshed[0].used;
        counters[0].reserved = refreshed[0].reserved;
      }

      const existing = await connection.query<Reservation>(
        `SELECT id, operation_id, account_id, metric, amount, state, period_start
         FROM usage_reservations WHERE operation_id = $1 AND metric = $2 FOR UPDATE`,
        [operationId, metric],
      );
      if (existing[0]) {
        if (Number(existing[0].amount) !== amount) fail(409, 'IDEMPOTENCY_CONFLICT', 'A operação já foi reservada com outros parâmetros.');
        if (existing[0].state === 'RESERVED' || existing[0].state === 'COMMITTED') return;
        fail(409, 'INVALID_STATE', 'A reserva anterior não pode ser reutilizada.');
      }

      if (Number(counters[0].used) + Number(counters[0].reserved) + amount > limit) {
        fail(429, 'QUOTA_EXCEEDED', 'O limite do período foi atingido.', {
          metric,
          limit: this.isBytesMetric(metric) ? String(limit) : limit,
        });
      }
      await connection.query(
        `INSERT INTO usage_reservations (id, operation_id, account_id, metric, amount, state, period_start, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'RESERVED', $6, now() + interval '24 hours')`,
        [randomUUID(), operationId, account.id, metric, amount, start],
      );
      await connection.query(
        `UPDATE usage_counters SET reserved = reserved + $4
         WHERE account_id = $1 AND metric = $2 AND period_start = $3`,
        [account.id, metric, start, amount],
      );
    });
  }

  async commit(userId: string, metric: string, operationId: string): Promise<void> {
    await this.transition(userId, metric, operationId, 'COMMITTED');
  }

  async release(userId: string, metric: string, operationId: string): Promise<void> {
    await this.transition(userId, metric, operationId, 'RELEASED');
  }

  async releaseCommitted(userId: string, metric: string, operationId: string): Promise<void> {
    await this.db.asActor(userId, async (connection) => {
      const candidates = await connection.query<Reservation>(
        `SELECT r.id, r.operation_id, r.account_id, r.metric, r.amount, r.state, r.period_start
         FROM usage_reservations r JOIN billing_accounts b ON b.id = r.account_id
         WHERE b.owner_user_id = $1 AND r.operation_id = $2 AND r.metric = $3`,
        [userId, operationId, metric],
      );
      const candidate = candidates[0];
      if (!candidate || candidate.state === 'RELEASED' || candidate.state === 'EXPIRED') return;
      const counters = await connection.query<{ used: number; reserved: number }>(
        `SELECT used, reserved FROM usage_counters
         WHERE account_id = $1 AND metric = $2 AND period_start = $3 FOR UPDATE`,
        [candidate.account_id, metric, candidate.period_start],
      );
      if (!counters[0]) return;
      const rows = await connection.query<Reservation>(
        `SELECT r.id, r.operation_id, r.account_id, r.metric, r.amount, r.state, r.period_start
         FROM usage_reservations r JOIN billing_accounts b ON b.id = r.account_id
         WHERE b.owner_user_id = $1 AND r.id = $2 AND r.operation_id = $3 AND r.metric = $4 FOR UPDATE OF r`,
        [userId, candidate.id, operationId, metric],
      );
      const reservation = rows[0];
      if (!reservation || reservation.state === 'RELEASED' || reservation.state === 'EXPIRED') return;
      const amount = Number(reservation.amount);
      if (reservation.state === 'COMMITTED') {
        const entitlement = await this.entitlement(connection, userId, metric);
        if (entitlement && this.period(entitlement) === 'concurrent') return;
        if (Number(counters[0].used) < amount) fail(409, 'INVALID_STATE', 'O consumo confirmado não pode ser estornado.');
        await connection.query(
          `UPDATE usage_counters SET used = used - $4 WHERE account_id = $1 AND metric = $2 AND period_start = $3`,
          [reservation.account_id, metric, reservation.period_start, amount],
        );
        await connection.query(
          `INSERT INTO usage_events (operation_id, account_id, metric, delta, reason)
           VALUES ($1, $2, $3, $4, 'ADJUSTMENT') ON CONFLICT (operation_id, metric, reason) DO NOTHING`,
          [operationId, reservation.account_id, metric, -amount],
        );
      } else if (reservation.state === 'RESERVED') {
        if (Number(counters[0].reserved) < amount) fail(409, 'INVALID_STATE', 'A reserva de uso não está disponível.');
        await connection.query(
          `UPDATE usage_counters SET reserved = reserved - $4 WHERE account_id = $1 AND metric = $2 AND period_start = $3`,
          [reservation.account_id, metric, reservation.period_start, amount],
        );
      }
      await connection.query(`UPDATE usage_reservations SET state = 'RELEASED', updated_at = now() WHERE id = $1`, [reservation.id]);
    });
  }

  async usage(userId: string): Promise<Array<{ metric: string; period: string | null; periodStart: string; used: number | string; reserved: number | string; limit: number | string | null }>> {
    return this.db.asActor(userId, async (connection) => {
      const account = await this.account(connection, userId);
      const rows = await connection.query<{
        metric: string;
        period: string | null;
        period_start: Date;
        used: string | number;
        reserved: string | number;
        value: unknown;
      }>(
        `SELECT c.metric, e.value->>'period' AS period, c.period_start, c.used, c.reserved, e.value
         FROM usage_counters c
         LEFT JOIN subscriptions s ON s.account_id = c.account_id AND s.state = 'ACTIVE'
           AND s.period_start <= now() AND s.period_end > now()
         LEFT JOIN plan_entitlements e ON e.plan_id = s.plan_id AND e.capability = c.metric
         WHERE c.account_id = $1 ORDER BY c.period_start DESC, c.metric`,
        [account.id],
      );
      return rows.map((row) => {
        const byteMetric = this.isBytesMetric(row.metric);
        const limit = row.value === null ? null : this.limitValue({ value_type: 'LIMIT', value: row.value });
        const used = this.safeCounter(row.used);
        const reserved = this.safeCounter(row.reserved);
        return {
          metric: row.metric,
          period: row.period,
          periodStart: new Date(row.period_start).toISOString(),
          used: byteMetric ? String(used) : used,
          reserved: byteMetric ? String(reserved) : reserved,
          limit: byteMetric && limit !== null ? String(limit) : limit,
        };
      });
    });
  }

  private async transition(userId: string, metric: string, operationId: string, state: 'COMMITTED' | 'RELEASED'): Promise<void> {
    await this.db.asActor(userId, async (connection) => {
      const candidates = await connection.query<Reservation>(
        `SELECT r.id, r.operation_id, r.account_id, r.metric, r.amount, r.state, r.period_start
         FROM usage_reservations r JOIN billing_accounts b ON b.id = r.account_id
         WHERE b.owner_user_id = $1 AND r.operation_id = $2 AND r.metric = $3`,
        [userId, operationId, metric],
      );
      const candidate = candidates[0];
      if (!candidate || candidate.state === 'RELEASED' || candidate.state === 'EXPIRED' || candidate.state === 'COMMITTED') return;
      const counters = await connection.query<{ used: number; reserved: number }>(
        `SELECT used, reserved FROM usage_counters
         WHERE account_id = $1 AND metric = $2 AND period_start = $3 FOR UPDATE`,
        [candidate.account_id, metric, candidate.period_start],
      );
      const rows = await connection.query<Reservation>(
        `SELECT r.id, r.operation_id, r.account_id, r.metric, r.amount, r.state, r.period_start
         FROM usage_reservations r JOIN billing_accounts b ON b.id = r.account_id
         WHERE b.owner_user_id = $1 AND r.id = $2 AND r.operation_id = $3 AND r.metric = $4 FOR UPDATE OF r`,
        [userId, candidate.id, operationId, metric],
      );
      const reservation = rows[0];
      if (!reservation || reservation.state === 'RELEASED' || reservation.state === 'EXPIRED' || reservation.state === 'COMMITTED') return;
      const amount = Number(reservation.amount);
      if (!counters[0] || Number(counters[0].reserved) < amount) {
        fail(409, 'INVALID_STATE', 'A reserva de uso não está disponível.');
      }
      if (state === 'COMMITTED') {
        const entitlement = await this.entitlement(connection, userId, metric);
        const isConcurrent = entitlement && this.period(entitlement) === 'concurrent';
        await connection.query(
          `UPDATE usage_counters SET reserved = reserved - $4, used = used + $5
           WHERE account_id = $1 AND metric = $2 AND period_start = $3`,
          [reservation.account_id, metric, reservation.period_start, amount, isConcurrent ? 0 : amount],
        );
        await connection.query(
          `INSERT INTO usage_events (operation_id, account_id, metric, delta, reason)
           VALUES ($1, $2, $3, $4, 'COMMIT') ON CONFLICT (operation_id, metric, reason) DO NOTHING`,
          [operationId, reservation.account_id, metric, isConcurrent ? 0 : amount],
        );
      } else {
        await connection.query(
          `UPDATE usage_counters SET reserved = reserved - $4
           WHERE account_id = $1 AND metric = $2 AND period_start = $3`,
          [reservation.account_id, metric, reservation.period_start, amount],
        );
        await connection.query(
          `INSERT INTO usage_events (operation_id, account_id, metric, delta, reason)
           VALUES ($1, $2, $3, $4, 'RELEASE') ON CONFLICT (operation_id, metric, reason) DO NOTHING`,
          [operationId, reservation.account_id, metric, -amount],
        );
      }
      await connection.query('UPDATE usage_reservations SET state = $2, updated_at = now() WHERE id = $1', [reservation.id, state]);
    });
  }

  private async account(connection: QueryConnection, userId: string): Promise<{ id: string }> {
    const rows = await connection.query<{ id: string }>('SELECT id FROM billing_accounts WHERE owner_user_id = $1', [userId]);
    if (!rows[0]) fail(403, 'CAPABILITY_REQUIRED', 'A conta não possui um titular de cobrança ativo.');
    return rows[0];
  }

  private async entitlement(connection: QueryConnection, userId: string, capability: string): Promise<Entitlement | undefined> {
    const rows = await connection.query<Entitlement>(
      `SELECT e.value_type, e.value
       FROM billing_accounts b
       JOIN subscriptions s ON s.account_id = b.id AND s.state = 'ACTIVE'
         AND s.period_start <= now() AND s.period_end > now()
       JOIN plans p ON p.id = s.plan_id AND p.status = 'ACTIVE'
       JOIN plan_entitlements e ON e.plan_id = p.id AND e.capability = $2
       WHERE b.owner_user_id = $1
       ORDER BY s.period_start DESC LIMIT 1`,
      [userId, capability],
    );
    return rows[0];
  }

  private async periodStart(connection: QueryConnection, period: string): Promise<Date> {
    if (period === 'lifetime' || period === 'concurrent') return new Date('1970-01-01T00:00:00.000Z');
    const unit = period === 'day' ? 'day' : 'month';
    const rows = await connection.query<{ period_start: Date }>(
      `SELECT date_trunc('${unit}', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc' AS period_start`,
    );
    return new Date(rows[0].period_start);
  }

  private period(entitlement: Entitlement): string {
    if (!entitlement.value || typeof entitlement.value !== 'object') return 'month';
    const period = (entitlement.value as Record<string, unknown>).period;
    if (period === 'day' || period === 'lifetime' || period === 'concurrent') return period;
    return 'month';
  }

  private limitValue(entitlement: Entitlement): number {
    if (!entitlement.value || typeof entitlement.value !== 'object') return 0;
    const value = Number((entitlement.value as Record<string, unknown>).limit);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  private safeCounter(value: number | string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      fail(500, 'USAGE_COUNTER_INVALID', 'O consumo não pôde ser calculado.');
    }
    return parsed;
  }

  private isBytesMetric(metric: string): boolean {
    return /(?:^|[._])bytes(?:$|[._])|_BYTES$/i.test(metric);
  }
}
