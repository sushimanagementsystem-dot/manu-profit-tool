import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { AppConfig } from '../config/env.schema';
import { InjectConfig } from '../config/config.module';

export type StorageArea = 'uploads' | 'exports';

/**
 * Private file storage on a local volume: `<root>/<jobId>/<area>/<randomId>`.
 * Original filenames are never used on disk; keys are opaque and job-prefixed so a whole
 * job can be deleted with one call. Swappable for an S3 driver behind the same methods.
 */
@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(@InjectConfig() config: AppConfig) {
    this.root = path.resolve(config.STORAGE_ROOT);
  }

  async put(jobId: string, area: StorageArea, data: Buffer): Promise<string> {
    const key = `${jobId}/${area}/${randomUUID()}`;
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data, { flag: 'wx' });
    return key;
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  stream(key: string): Readable {
    return createReadStream(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  /** Idempotent: deleting something that is already gone is a success. */
  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async deleteJob(jobId: string): Promise<void> {
    await rm(this.resolve(jobId), { recursive: true, force: true });
  }

  /** Maps a key to a path and refuses anything that would escape the storage root. */
  private resolve(key: string): string {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(this.root + path.sep)) {
      throw new Error('Storage key escapes the storage root.');
    }
    return target;
  }
}
