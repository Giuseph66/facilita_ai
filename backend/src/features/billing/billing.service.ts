import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../core/database.service';
import { QuotaService } from '../../core/quota.service';

type EntitlementRow = { capability: string; value_type: 'BOOLEAN' | 'LIMIT' | 'CONFIG'; value: unknown };

@Injectable()
export class BillingService {
  constructor(private readonly db: DatabaseService, private readonly quota: QuotaService) {}

  async plans() {
    const rows = await this.db.query<{
      id: string; code: string; name: string; catalog_version: number; capabilities: EntitlementRow[]; price: { amount: string; currency: string; interval: string } | null;
    }>(
      `SELECT p.id, p.code, p.name, p.catalog_version,
        COALESCE(jsonb_agg(jsonb_build_object('capability', e.capability, 'value_type', e.value_type, 'value', e.value)
          ORDER BY e.capability) FILTER (WHERE e.capability IS NOT NULL), '[]'::jsonb) AS capabilities,
        (SELECT jsonb_build_object('amount', pp.amount::text, 'currency', pp.currency, 'interval', pp.interval)
         FROM plan_prices pp WHERE pp.plan_id = p.id AND pp.valid_from <= now()
           AND (pp.valid_until IS NULL OR pp.valid_until > now())
         ORDER BY pp.valid_from DESC LIMIT 1) AS price
       FROM plans p LEFT JOIN plan_entitlements e ON e.plan_id = p.id
       WHERE p.status = 'ACTIVE' GROUP BY p.id
       ORDER BY CASE p.code WHEN 'FREE' THEN 0 WHEN 'BYOK' THEN 1 WHEN 'PREMIUM' THEN 2 WHEN 'TEACHER_PRO' THEN 3 ELSE 4 END,
                p.catalog_version`,
    );
    return {
      items: rows.map((row) => ({
        code: row.code,
        name: row.name,
        catalogVersion: Number(row.catalog_version),
        capabilities: this.capabilityMap(row.capabilities),
        price: row.price ? { ...row.price, interval: row.price.interval as 'month' | 'year' } : null,
      })),
      nextCursor: null,
    };
  }

  async entitlements(userId: string) {
    return this.db.asActor(userId, async (connection) => {
      const subscription = await connection.query<{
        code: string; name: string; catalog_version: number; period_end: Date;
      }>(
        `SELECT p.code, p.name, p.catalog_version, s.period_end
         FROM billing_accounts b JOIN subscriptions s ON s.account_id = b.id
         JOIN plans p ON p.id = s.plan_id
         WHERE b.owner_user_id = $1 AND s.state = 'ACTIVE' AND s.period_start <= now() AND s.period_end > now()
         ORDER BY s.period_start DESC LIMIT 1`, [userId],
      );
      const selected = subscription[0];
      if (!selected) return { plan: null, capabilities: {}, limits: {}, platformAiEnabled: false };
      const rows = await connection.query<EntitlementRow>(
        `WITH active_plan AS (
           SELECT s.plan_id FROM subscriptions s JOIN billing_accounts b ON b.id = s.account_id
           WHERE b.owner_user_id = $1 AND s.state = 'ACTIVE'
             AND s.period_start <= now() AND s.period_end > now()
           ORDER BY s.period_start DESC LIMIT 1
         )
         SELECT e.capability, e.value_type, e.value FROM plan_entitlements e
         JOIN active_plan ap ON ap.plan_id = e.plan_id ORDER BY e.capability`, [userId],
      );
      const capabilities: Record<string, unknown> = {};
      const limits: Record<string, { limit: number | string; period: string }> = {};
      for (const row of rows) {
        if (row.value_type === 'BOOLEAN') capabilities[row.capability] = row.value === true;
        else if (row.value_type === 'LIMIT') {
          const config = row.value && typeof row.value === 'object' ? row.value as Record<string, unknown> : {};
          const limit = Number(config.limit);
          const period = typeof config.period === 'string' ? config.period : 'month';
          if (Number.isSafeInteger(limit) && limit >= 0) {
            const publicLimit = this.isBytesMetric(row.capability) ? String(limit) : limit;
            limits[row.capability] = { limit: publicLimit, period };
            capabilities[row.capability] = limits[row.capability];
          }
        } else capabilities[row.capability] = row.value;
      }
      return {
        plan: { code: selected.code, name: selected.name, catalogVersion: Number(selected.catalog_version), periodEnd: new Date(selected.period_end).toISOString() },
        capabilities,
        limits,
        platformAiEnabled: capabilities.AI_PLATFORM_ACCESS === true,
      };
    });
  }

  async usage(userId: string, period?: string) {
    const items = await this.quota.usage(userId);
    const filtered = period ? items.filter((item) => item.period === period) : items;
    return { items: filtered, nextCursor: null };
  }

  private capabilityMap(rows: EntitlementRow[]): Record<string, { type: string; value: unknown }> {
    const result: Record<string, { type: string; value: unknown }> = {};
    for (const row of rows ?? []) {
      let value = row.value;
      if (row.value_type === 'LIMIT' && this.isBytesMetric(row.capability) && value && typeof value === 'object') {
        const config = value as Record<string, unknown>;
        const limit = Number(config.limit);
        if (Number.isSafeInteger(limit) && limit >= 0) value = { ...config, limit: String(limit) };
      }
      result[row.capability] = { type: row.value_type, value };
    }
    return result;
  }

  private isBytesMetric(metric: string): boolean {
    return /(?:^|[._])bytes(?:$|[._])|_BYTES$/i.test(metric);
  }
}
