import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';
import { databaseSchema } from '../database/schema';

export interface QueryConnection {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;
  readonly orm: ReturnType<typeof drizzle>;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');
    this.pool = new Pool({
      connectionString,
      max: Number(process.env.DB_POOL_SIZE ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: process.env.DB_APPLICATION_NAME ?? 'facilita-estudo-api',
    });
    this.orm = drizzle(this.pool, { schema: databaseSchema });
  }

  async onModuleInit(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T & QueryResultRow>(sql, params as never[]);
    return result.rows;
  }

  async transaction<T>(work: (connection: QueryConnection) => Promise<T>): Promise<T> {
    return this.runTransaction(undefined, work);
  }

  async asActor<T>(userId: string, work: (connection: QueryConnection) => Promise<T>): Promise<T> {
    return this.runTransaction(userId, work);
  }

  async checkReady(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  private async runTransaction<T>(
    actorId: string | undefined,
    work: (connection: QueryConnection) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    const connection = this.connectionFor(client);
    try {
      await client.query('BEGIN');
      if (actorId) {
        await client.query("SELECT set_config('app.user_id', $1, true)", [actorId]);
      }
      const value = await work(connection);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private connectionFor(client: PoolClient): QueryConnection {
    return {
      query: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
        const result = await client.query<T & QueryResultRow>(sql, params as never[]);
        return result.rows;
      },
    };
  }
}
