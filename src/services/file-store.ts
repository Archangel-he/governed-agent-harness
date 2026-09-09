import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { SessionEvent, SessionStore, TrajectoryStore, WorkspaceStore } from '../contracts/runtime.js';
import type { TrajectoryEvent } from '../contracts/domain.js';
import { jsonSnapshot, validateSessionEvent } from './log-value.js';
import { acquireFileLock as lock, atomicJson } from './local-file.js';

function missing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }
function readLines<T>(file: string): T[] {
  let text: string;
  try { text = readFileSync(file, 'utf8'); } catch (error) { if (missing(error)) return []; throw error; }
  if (text.length === 0) return [];
  if (!text.endsWith('\n')) throw new Error('Incomplete JSONL tail: ' + file);
  return text.slice(0, -1).split('\n').map((line, index) => { try { return JSON.parse(line) as T; } catch (cause) { throw new Error('Corrupt JSONL at line ' + (index + 1) + ': ' + file, { cause }); } });
}
interface JsonlIndex { version: 1; generation: number; bytes: number; ids: string[]; }
function indexPath(file: string): string { return file + '.index.json'; }
function loadIndex<T extends { id: string }>(file: string, validate: (value: unknown) => void): JsonlIndex {
  try { const index = JSON.parse(readFileSync(indexPath(file), 'utf8')) as JsonlIndex; if (index.version !== 1 || !Number.isSafeInteger(index.generation) || !Number.isSafeInteger(index.bytes) || !Array.isArray(index.ids)) throw new Error('Invalid JSONL index'); return index; }
  catch (error) { if (!missing(error)) throw error; const rows = readLines<T>(file); rows.forEach(validate); const index = { version: 1 as const, generation: rows.length, bytes: Buffer.byteLength(rows.length ? rows.map(row => JSON.stringify(row)).join('\n') + '\n' : ''), ids: rows.map(row => row.id) }; atomicJson(indexPath(file), index); return index; }
}
function append<T extends { id: string }>(file: string, event: T, validate: (value: unknown) => void): void {
  validate(event); const snapshot = jsonSnapshot(event); const release = lock(file + '.append.lock');
  try { const index = loadIndex<T>(file, validate); if (index.ids.includes(event.id)) throw new Error('Duplicate event ID'); const line = JSON.stringify(snapshot) + '\n'; const fd = openSync(file, 'a'); try { appendFileSync(fd, line, 'utf8'); fsyncSync(fd); } finally { closeSync(fd); } atomicJson(indexPath(file), { version: 1, generation: index.generation + 1, bytes: index.bytes + Buffer.byteLength(line), ids: [...index.ids, event.id] }); }
  finally { release(); }
}

export class JsonlSessionStore implements SessionStore {
  private readonly file: string;
  constructor(file: string) { mkdirSync(dirname(file), { recursive: true }); this.file = join(realpathSync(dirname(file)), basename(file)); }
  acquire(sessionId: string): () => void { const digest = createHash('sha256').update(sessionId).digest('hex'); return lock(this.file + '.' + digest + '.writer.lock'); }
  append(event: SessionEvent): void { append(this.file, event, validateSessionEvent); }
  metadata(): { version: number; generation: number } { const index = loadIndex<SessionEvent>(this.file, validateSessionEvent); return { version: 1, generation: index.generation }; }
  events(sessionId: string): SessionEvent[] { const events = readLines<SessionEvent>(this.file); for (const event of events) validateSessionEvent(event); if (new Set(events.map(event => event.id)).size !== events.length) throw new Error('Duplicate event ID in log'); return events.filter(event => event.sessionId === sessionId); }
}
function validateTrajectory(event: unknown): void { if (!event || typeof event !== 'object') throw new Error('Invalid TrajectoryEvent'); const row = event as Record<string, unknown>; for (const key of ['id', 'executionId', 'agentId', 'agentVersionId', 'operationId', 'type', 'status']) if (typeof row[key] !== 'string' || !row[key]) throw new Error('Invalid trajectory ' + key); }
export class JsonlTrajectoryStore implements TrajectoryStore {
  constructor(private readonly file: string) { mkdirSync(dirname(file), { recursive: true }); }
  append(event: TrajectoryEvent): void { append(this.file, event, validateTrajectory); }
  list(executionId: string): TrajectoryEvent[] { const rows = readLines<TrajectoryEvent>(this.file); rows.forEach(validateTrajectory); return rows.filter(event => event.executionId === executionId); }
}
export class FileWorkspaceStore implements WorkspaceStore {
  private readonly root: string;
  constructor(root: string) { mkdirSync(root, { recursive: true }); this.root = realpathSync(root); }
  private file(workspaceId: string, path: string): string { if (!/^[a-zA-Z0-9_-]+$/.test(workspaceId)) throw new Error('Invalid workspace ID'); if (!path || path.includes(':') || isAbsolute(path)) throw new Error('Invalid workspace path'); const base = join(this.root, workspaceId); const file = resolve(base, path); const rel = relative(base, file); if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('Workspace path escape'); let part = this.root; for (const name of relative(this.root, file).split(sep)) { part = join(part, name); try { if (lstatSync(part).isSymbolicLink()) throw new Error('Workspace symlink denied'); } catch (error) { if (!missing(error)) throw error; } } return file; }
  write(workspaceId: string, path: string, content: string): void { const file = this.file(workspaceId, path); mkdirSync(dirname(file), { recursive: true }); const temporary = file + '.' + randomUUID() + '.tmp'; try { const fd = openSync(temporary, 'wx'); try { writeFileSync(fd, content, 'utf8'); fsyncSync(fd); } finally { closeSync(fd); } renameSync(temporary, file); } finally { try { unlinkSync(temporary); } catch (error) { if (!missing(error)) throw error; } } }
  read(workspaceId: string, path: string): string | undefined { const file = this.file(workspaceId, path); try { return readFileSync(file, 'utf8'); } catch (error) { if (missing(error)) return undefined; throw error; } }
}
