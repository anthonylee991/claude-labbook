/**
 * Drop-in replacement for db/lance.ts — routes through daemon IPC.
 * Provides ProxyTable that mimics the LanceDB table interface used by tool code.
 */

import { getClient } from "./spawn.js";

class SearchBuilder {
  private _limit = 10;
  private _where?: string;

  constructor(
    private tableName: "trial" | "code",
    private vector: number[]
  ) {}

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  where(filter: string): this {
    this._where = filter;
    return this;
  }

  async toArray(): Promise<Record<string, unknown>[]> {
    const client = getClient();
    return (await client.request(`lance.${this.tableName}Search`, {
      vector: this.vector,
      limit: this._limit,
      where: this._where,
    })) as Record<string, unknown>[];
  }
}

class ProxyTable {
  constructor(private tableName: "trial" | "code") {}

  async add(rows: Record<string, unknown>[]): Promise<void> {
    const client = getClient();
    await client.request(`lance.${this.tableName}Add`, { rows });
  }

  async delete(filter: string): Promise<void> {
    const client = getClient();
    await client.request(`lance.${this.tableName}Delete`, { filter });
  }

  search(vector: number[]): SearchBuilder {
    return new SearchBuilder(this.tableName, vector);
  }
}

export async function getTrialTable(): Promise<ProxyTable> {
  return new ProxyTable("trial");
}

export async function getCodeTable(): Promise<ProxyTable> {
  return new ProxyTable("code");
}
