import type { Cookie } from '@playwright/test';

// Authentication stays in the worker's memory and out of reports or storage files.
// Independent tests still create their own resources; standalone runs can register normally.
export const qaAccounts = new Map<string, { name: string; cookies: Cookie[] }>();
