import { mkdirSync, realpathSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
export interface SandboxSpec { id: string; root: string; network: 'none'|'restricted'|'full'; }
export interface SandboxAdapter { create(spec: SandboxSpec): SandboxHandle; }
export interface SandboxRunResult { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; }
export interface SandboxHandle { readonly spec: SandboxSpec; resolve(path: string): string; run(command: string, args?: string[]): Promise<SandboxRunResult>; dispose(): Promise<void>; }
export class LocalSandboxAdapter implements SandboxAdapter {
  create(spec: SandboxSpec): SandboxHandle {
    mkdirSync(spec.root, { recursive: true });
    const root = realpathSync(spec.root);
    return { spec, resolve: path => { const target = resolve(root, path); const inside = target === root || target.startsWith(root + '\\') || target.startsWith(root + '/'); if (!inside) throw new Error('sandbox path escape'); return target; }, run: async (command, args = []) => {
      if (spec.network !== 'full') throw new Error('sandbox runner unavailable: OS network isolation is required');
      return await new Promise((resolveResult, reject) => { const child = spawn(command, args, { cwd: root, windowsHide: true }); let stdout = '', stderr = ''; child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; }); child.once('error', reject); child.once('close', (code, signal) => resolveResult({ code, signal, stdout, stderr })); });
    }, dispose: async () => {} };
  }
}
