declare module 'cordis' {
  export class Fiber { await(): Promise<this>; dispose(): Promise<void>; }
  export class Context {
    plugin(plugin: { name: string; apply: (context: Context) => void }): Fiber;
    effect(execute: () => () => void, label?: string): unknown;
  }
}
