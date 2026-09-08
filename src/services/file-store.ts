import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { SessionEvent, SessionStore, TrajectoryStore, WorkspaceStore } from '../contracts/runtime.js';
import type { TrajectoryEvent } from '../contracts/domain.js';
import { jsonSnapshot, validateSessionEvent } from './log-value.js';

function missing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }

// Local single-writer ownership; stale locks are never silently stolen.
function lock(path: string): () => void {
  try { const fd = openSync(path, 'wx'); writeFileSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() })); closeSync(fd); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    try { const text = readFileSync(path, 'utf8'); const row = JSON.parse(text); const stale = Date.now() - statSync(path).mtimeMs > 60_000; let alive = true; try { process.kill(Number(row.pid), 0); } catch { alive = false; } if (stale && !alive) unlinkSync(path); else { const held = new Error('EEXIST: Writer lock is held') as NodeJS.ErrnoException; held.code = 'EEXIST'; throw held; } }
    catch (inner) { if ((inner as NodeJS.ErrnoException).code === 'ENOENT') return lock(path); throw inner; }
    return lock(path);
  }
  let released = false;
  return () => { if (!released) { unlinkSync(path); released = true; } };
}

function readLines<T>(file: string): T[] {
  let text: string;
  try { text = readFileSync(file, 'utf8'); }
  catch (error) { if (missing(error)) return []; throw error; }
  if (text.length === 0) return [];
  if (!text.endsWith('\n')) throw new Error('Incomplete JSONL tail: ' + file);
  return text.slice(0, -1).split('\n').map((line, index) => {
    try { return JSON.parse(line) as T; }
    catch (cause) { throw new Error('Corrupt JSONL at line ' + (index + 1) + ': ' + file, { cause }); }
  });
}

function append<T extends { id: string }>(file: string, event: T, validate: (value: unknown) => void): void {
  validate(event);
  const snapshot = jsonSnapshot(event);
  const release = lock(file + '.append.lock');
  try {
    // ponytail: scans the local log; use an indexed transactional store for large histories.
    const existing = readLines<T>(file);
    for (const row of existing) validate(row);
    if (existing.some(row => row.id === event.id)) throw new Error('Duplicate event ID');
    const fd = openSync(file, 'a');
    try { appendFileSync(fd, JSON.stringify(snapshot) + '\n', 'utf8'); fsyncSync(fd); }
    finally { closeSync(fd); }
  } finally { release(); }
}

export class JsonlSessionStore implements SessionStore {
  private readonly file: string;
  private readonly meta: string;
  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true });
    this.file = join(realpathSync(dirname(file)), basename(file));
    this.meta = this.file + '.meta.json';
    if (!missingFile(this.meta)) this.readMeta();
  }
  acquire(sessionId: string): () => void {
    const digest = createHash('sha256').update(sessionId).digest('hex');
    return lock(this.file + '.' + digest + '.writer.lock');
  }
  append(event: SessionEvent): void {
    append(this.file, event, validateSessionEvent);
    const previous = this.readMeta();
    this.writeMeta({ version: 1, generation: previous.generation + 1 });
  }
  metadata(): { version: number; generation: number } { return this.readMeta(); }
  events(sessionId: string): SessionEvent[] {
    const events = readLines<SessionEvent>(this.file);
    for (const event of events) validateSessionEvent(event);
    if (new Set(events.map(event => event.id)).size !== events.length) throw new Error('Duplicate event ID in log');
    return events.filter(event => event.sessionId === sessionId);
  }
  private readMeta(): { version: number; generation: number } {
    try { const value = JSON.parse(readFileSync(this.meta, 'utf8')); if (value?.version !== 1 || !Number.isSafeInteger(value.generation) || value.generation < 0) throw new Error('Invalid session metadata'); return value; }
    catch (error) { if (missing(error)) return { version: 1, generation: 0 }; throw error; }
  }
  private writeMeta(value: { version: number; generation: number }): void {
    const temp = this.meta + '.' + randomUUID() + '.tmp';
    try { writeFileSync(temp, JSON.stringify(value) + '\n', 'utf8'); renameSync(temp, this.meta); } finally { try { unlinkSync(temp); } catch (error) { if (!missing(error)) throw error; } }
  }
}
function missingFile(file: string): boolean { try { readFileSync(file); return false; } catch (error) { if (missing(error)) return true; throw error; } }

function validateTrajectory(event: unknown): void {
  if (!event || typeof event !== 'object') throw new Error('Invalid TrajectoryEvent');
  const row = event as Record<string, unknown>;
  for (const key of ['id', 'executionId', 'agentId', 'agentVersionId', 'operationId', 'type', 'status']) {
    if (typeof row[key] !== 'string' || !row[key]) throw new Error('Invalid trajectory ' + key);
  }
}

export class JsonlTrajectoryStore implements TrajectoryStore {
  constructor(private readonly file: string) { mkdirSync(dirname(file), { recursive: true }); }
  append(event: TrajectoryEvent): void { append(this.file, event, validateTrajectory); }
  list(executionId: string): TrajectoryEvent[] {
    const rows = readLines<TrajectoryEvent>(this.file);
    rows.forEach(validateTrajectory);
    return rows.filter(event => event.executionId === executionId);
  }
}

export class FileWorkspaceStore implements WorkspaceStore {
  private readonly root: string;
  constructor(root: string) { mkdirSync(root, { recursive: true }); this.root = realpathSync(root); }
  private file(workspaceId: string, path: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(workspaceId)) throw new Error('Invalid workspace ID');
    if (!path || path.includes(':') || isAbsolute(path)) throw new Error('Invalid workspace path');
    const base = join(this.root, workspaceId);
    const file = resolve(base, path);
    const rel = relative(base, file);
    if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('Workspace path escape');
    // Trusted local storage: reject symlinks/junctions. Hostile concurrent writers still require OS isolation.
    let part = this.root;
    for (const name of relative(this.root, file).split(sep)) {
      part = join(part, name);
      try { if (lstatSync(part).isSymbolicLink()) throw new Error('Workspace symlink denied'); }
      catch (error) { if (!missing(error)) throw error; }
    }
    return file;
  }
  write(workspaceId: string, path: string, content: string): void {
    const file = this.file(workspaceId, path);
    mkdirSync(dirname(file), { recursive: true });
    const temporary = file + '.' + randomUUID() + '.tmp';
    try {
      const fd = openSync(temporary, 'wx');
      try { writeFileSync(fd, content, 'utf8'); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temporary, file);
    } finally { try { unlinkSync(temporary); } catch (error) { if (!missing(error)) throw error; } }
  }
  read(workspaceId: string, path: string): string | undefined {
    const file = this.file(workspaceId, path);
    try { return readFileSync(file, 'utf8'); } catch (error) { if (missing(error)) return undefined; throw error; }
  }
}

