import { Injectable } from '@nestjs/common';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';

@Injectable()
export class StorageService {
  private readonly root = path.resolve(process.env.STORAGE_PATH ?? process.env.PRIVATE_STORAGE_ROOT ?? path.join(process.cwd(), '.storage'));

  resolve(key: string): string {
    const parts = this.parts(key);
    const resolved = path.resolve(this.root, ...parts);
    const relative = path.relative(this.root, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid storage key');
    return resolved;
  }

  async put(key: string, value: Buffer): Promise<void> {
    const target = this.resolve(key);
    await this.ensureParent(key);
    const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      await handle.writeFile(value);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async get(key: string): Promise<Buffer> {
    const target = this.resolve(key);
    await this.verifyParents(key, false);
    const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new Error('Storage object is not a file');
      if ((info.mode & 0o077) !== 0) throw new Error('Storage object permissions are too broad');
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  }

  async remove(key: string): Promise<void> {
    const target = this.resolve(key);
    try {
      await this.verifyParents(key, false);
      const info = await lstat(target);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Storage object is not a regular file');
      await unlink(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private parts(key: string): string[] {
    if (typeof key !== 'string' || key.length < 1 || key.length > 512 || key.includes('\\') || key.includes('\0')) {
      throw new Error('Invalid storage key');
    }
    const parts = key.split('/');
    if (parts.some((part) => !part || part === '.' || part === '..' || !/^[A-Za-z0-9_.-]+$/.test(part))) {
      throw new Error('Invalid storage key');
    }
    return parts;
  }

  private async ensureParent(key: string): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await this.verifyParents(key, true);
  }

  private async verifyParents(key: string, create: boolean): Promise<void> {
    const parts = this.parts(key).slice(0, -1);
    const rootInfo = await lstat(this.root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('Storage root is not a private directory');
    if ((rootInfo.mode & 0o077) !== 0) throw new Error('Storage root permissions are too broad');
    const actualRoot = await realpath(this.root);
    if (actualRoot !== this.root) throw new Error('Storage root symlinks are not allowed');
    let current = this.root;
    for (const part of parts) {
      current = path.join(current, part);
      if (create) {
        try {
          await mkdir(current, { mode: 0o700 });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
      }
      const info = await lstat(current);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Storage symlinks are not allowed');
      if ((info.mode & 0o077) !== 0) throw new Error('Storage directory permissions are too broad');
      const actual = await realpath(current);
      if (actual !== current) throw new Error('Storage symlinks are not allowed');
    }
  }
}
