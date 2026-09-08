export class RevisionConflict extends Error {}
export class MemoryRootSession {
  constructor(public revision = 0, public state: unknown = {}) {}
  commit(expectedRevision: number, nextState: unknown): number {
    if (expectedRevision !== this.revision) throw new RevisionConflict(`expected ${expectedRevision}, actual ${this.revision}`);
    this.state = nextState; return ++this.revision;
  }
}
