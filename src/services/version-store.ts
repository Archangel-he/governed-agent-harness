import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TopologyDefinition } from '../topology/schema.js';

export interface LocalVersion { id: string; topology: TopologyDefinition; [key: string]: unknown; }

export class LocalVersionStore {
  private readonly activeFile: string;
  constructor(private readonly root: string) { mkdirSync(root, { recursive: true }); this.activeFile = join(root, 'active.json'); }
  publish(version: LocalVersion): void {
    const file = join(this.root, `${version.id}.json`);
    if (existsSync(file)) throw new Error('immutable version already exists');
    writeFileSync(file + '.tmp', JSON.stringify(version) + '\n', 'utf8');
    renameSync(file + '.tmp', file);
  }
  get(id: string): LocalVersion {
    return JSON.parse(readFileSync(join(this.root, `${id}.json`), 'utf8')) as LocalVersion;
  }
  activate(id: string): void { this.get(id); writeFileSync(this.activeFile + '.tmp', JSON.stringify({ id }) + '\n', 'utf8'); renameSync(this.activeFile + '.tmp', this.activeFile); }
  active(): LocalVersion { return this.get((JSON.parse(readFileSync(this.activeFile, 'utf8')) as { id: string }).id); }
  rollback(id: string): void { this.activate(id); }
}
