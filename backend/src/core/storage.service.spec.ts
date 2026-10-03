import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  let root: string;
  let outside: string;
  let storage: StorageService;
  let originalStoragePath: string | undefined;

  beforeEach(async () => {
    originalStoragePath = process.env.STORAGE_PATH;
    const temp = await mkdtemp(path.join(os.tmpdir(), 'facilita-storage-'));
    root = path.join(temp, 'root');
    outside = path.join(temp, 'outside');
    await mkdir(root, { mode: 0o700 });
    await mkdir(outside);
    process.env.STORAGE_PATH = root;
    storage = new StorageService();
  });

  afterEach(async () => {
    if (originalStoragePath === undefined) delete process.env.STORAGE_PATH;
    else process.env.STORAGE_PATH = originalStoragePath;
    await rm(path.dirname(root), { recursive: true, force: true });
  });

  it('rejects traversal and malformed storage keys before filesystem access', () => {
    expect(() => storage.resolve('../outside/secret')).toThrow();
    expect(() => storage.resolve('safe/../../secret')).toThrow();
    expect(() => storage.resolve('safe\\secret')).toThrow();
  });

  it('does not follow symlinked parent directories during reads or removals', async () => {
    await writeFile(path.join(outside, 'secret'), 'private');
    await symlink(outside, path.join(root, 'linked-directory'), 'dir');

    await expect(storage.get('linked-directory/secret')).rejects.toThrow();
    await expect(storage.remove('linked-directory/secret')).rejects.toThrow();
    await expect(storage.put('linked-directory/new-file', Buffer.from('private'))).rejects.toThrow();
  });

  it('does not follow a symlinked storage root', async () => {
    const actualRoot = path.join(path.dirname(root), 'actual-root');
    await mkdir(actualRoot, { mode: 0o700 });
    await rm(root, { recursive: true, force: true });
    await symlink(actualRoot, root, 'dir');

    await expect(storage.get('secret')).rejects.toThrow();
    await expect(storage.remove('secret')).rejects.toThrow();
  });
});
