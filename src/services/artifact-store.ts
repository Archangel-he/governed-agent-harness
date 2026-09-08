import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ArtifactRecord { hash: string; mediaType: string; size: number; }

export class LocalArtifactStore {
  constructor(private readonly root: string) { mkdirSync(root, { recursive: true }); }
  async put(content: Buffer, mediaType: string): Promise<ArtifactRecord> {
    const hash = createHash('sha256').update(content).digest('hex');
    const file = join(this.root, hash);
    if (!existsSync(file)) writeFileSync(file, content, { flag: 'wx' });
    return { hash, mediaType, size: content.byteLength };
  }
  async get(hash: string): Promise<Buffer | undefined> {
    try { return readFileSync(join(this.root, hash)); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  }
  async has(hash: string): Promise<boolean> { return existsSync(join(this.root, hash)); }
}
