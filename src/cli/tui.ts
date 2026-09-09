import {stdin, stdout} from 'node:process';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {assembleAgent} from '../agent.js';
import {governanceReport} from '../governance/report.js';
import {toolAgentTemplate} from '../templates/tool-agent.js';

export interface ParsedCommand {name: string; args: string[]}
export type CommandGroup = Record<string, string[]>
export const commandGroups: CommandGroup = {run: ['execute', 'repeat'], team: ['status', 'members', 'inbox'], trace: ['last', 'events'], memory: ['wiki', 'episodes', 'search'], eval: ['last', 'dataset', 'feedback'], governance: ['report', 'proposals'], system: ['status', 'plugins', 'topology', 'help', 'quit']};
export function parseCommand(line: string): ParsedCommand { const parts = line.trim().replace(/^\//, '').split(/\s+/).filter(Boolean); return {name: parts[0] ?? '', args: parts.slice(1)} }
const CSI = '\x1b[';
const sgr = (code: string, text: string) => `${CSI}${code}m${text}${CSI}0m`;
const box = (text: string, width: number) => { const inner = Math.max(10, width - 4); const lines = text.split('\n').flatMap(line => line.length > inner ? line.match(new RegExp(`.{1,${inner}}`, 'g')) ?? [''] : [line]); return [`╭${'─'.repeat(width - 2)}╮`, ...lines.map(line => `│ ${line.padEnd(inner)} │`), `╰${'─'.repeat(width - 2)}╯`]; };

export async function startTui(root = mkdtempSync(join(tmpdir(), 'agent-tui-'))): Promise<void> {
  const definition = {...toolAgentTemplate(), agentId: 'supreme-agent'}; const agent = assembleAgent(root, definition);
  let last: Awaited<ReturnType<typeof agent.run>> | undefined; let lastInput = ''; let input = ''; let palette = false; let group = ''; let selected = 0;
  const transcript: Array<{role: 'user' | 'agent' | 'system'; text: string}> = [{role: 'system', text: 'Ready. Ask Supreme Agent anything.'}];
  const groups = Object.keys(commandGroups);
  const render = () => { const width = Math.max(64, Math.min(stdout.columns || 96, 120)); const height = Math.max(12, stdout.rows || 28); stdout.write(`${CSI}2J${CSI}H${CSI}?25l`); const state = last ? last.status : 'idle';
    stdout.write(`${sgr('1;97', '  Supreme Agent')} ${sgr('90', '·')} ${sgr('36', definition.agentId)} ${sgr('90', '·')} ${agent.version.id} ${sgr('90', '·')} ${definition.memoryMode ?? 'stateless'} ${sgr(state === 'completed' ? '32' : '90', `· ${state}`)}\n`);
    stdout.write(sgr('90', `  ${'─'.repeat(width - 4)}`) + '\n');
    const rows: string[] = []; for (const message of transcript.slice(-Math.max(3, height - 10))) { const label = message.role === 'user' ? sgr('36', '  You') : message.role === 'agent' ? sgr('35', '  Supreme Agent') : sgr('90', '  System'); rows.push(label); rows.push(...message.text.split('\n').map(line => `    ${line}`)); rows.push(''); }
    stdout.write(rows.join('\n')); stdout.write(`\n${sgr('90', `  ${'─'.repeat(width - 4)}`)}\n`);
    if (palette) { const items = group ? commandGroups[group] : groups; const title = group ? `/${group}` : 'Commands'; const menu = items.map((item, i) => i === selected ? sgr('30;47', ` ${item} `) : ` ${item} `).join('  '); stdout.write(box(`${sgr('1;33', title)}\n\n${menu}\n\n${sgr('90', '↑↓ select · Enter open · Esc close · Backspace back')}`, Math.min(width - 4, 76)).map(line => `  ${line}`).join('\n') + '\n'); }
    const prompt = input || (palette ? 'Select a command...' : 'Ask Supreme Agent or type / for commands'); stdout.write(box(`${sgr('36', '>')} ${prompt}`, width - 4).map(line => `  ${line}`).join('\n') + '\n'); stdout.write(sgr('90', '  Enter send · / commands · ↑↓ history · Ctrl+C quit') + '\n');
  };
  const append = (role: 'user' | 'agent' | 'system', value: unknown): void => { transcript.push({role, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2)}); };
  const execute = async (command: string, args: string[]): Promise<void> => {
    if (command === 'run execute') { lastInput = args.join(' '); if (!lastInput) return append('system', 'Usage: /run execute <input>'); append('user', lastInput); last = await agent.run(crypto.randomUUID(), lastInput); return append('agent', last.output ?? last.error ?? last.status); }
    if (command === 'run repeat') return lastInput ? execute('run execute', [lastInput]) : append('system', 'No previous input.');
    if (command === 'team status') return append('system', {leader: definition.agentId, members: [], mode: 'single-agent'});
    if (command === 'team members') return append('system', 'No members registered.'); if (command === 'team inbox') return append('system', 'Inbox is empty.');
    if (command === 'trace last') return append('system', last?.trace ?? null); if (command === 'trace events') return append('system', last?.trace.events ?? []);
    if (command === 'memory wiki') return append('system', {mode: definition.memoryMode ?? 'stateless', pinned: agent.wiki.pinned('agent', definition.agentId)}); if (command === 'memory episodes') return append('system', agent.episodes.list()); if (command === 'memory search') return append('system', 'Stateless mode: no episodic search.');
    if (command === 'eval last') return append('system', last && lastInput ? await agent.evaluate(last, lastInput) : 'No execution yet'); if (command === 'eval dataset') return append('system', {evaluationDigest: agent.version.evaluationDigest}); if (command === 'eval feedback') return append('system', 'Feedback is provided through the EvaluationPackage.');
    if (command === 'governance report') return append('system', last ? governanceReport(last.trace, new Set(definition.plugins.map(plugin => plugin.manifest.id))) : null); if (command === 'governance proposals') return append('system', 'No pending proposals.');
    if (command === 'system status') return append('system', {agentId: definition.agentId, version: agent.version.id, status: last?.status ?? 'idle', pluginCount: definition.plugins.length}); if (command === 'system plugins') return append('system', definition.plugins.map(plugin => plugin.manifest)); if (command === 'system topology') return append('system', agent.version.topology);
  };
  const stop = () => { stdin.setRawMode?.(false); stdin.pause(); stdout.write(`${CSI}0m${CSI}?25h\n`); };
  return new Promise(resolve => { stdin.setRawMode?.(true); stdin.resume(); stdin.setEncoding('utf8'); render(); stdin.on('data', async (chunk: string) => { if (chunk === '\u0003') { stop(); resolve(); return; } if (chunk === '\x1b') { palette = false; group = ''; selected = 0; render(); return; } if (chunk === '/' && !input && !palette) { palette = true; render(); return; } if (chunk === '\r' || chunk === '\n') { if (palette) { const item = (group ? commandGroups[group] : groups)[selected]; if (!group) { group = item; selected = 0; } else { palette = false; await execute(`${group} ${item}`, []); group = ''; selected = 0; } render(); return; } const text = input.trim(); input = ''; if (text) await execute(text.startsWith('/') ? `${parseCommand(text).name} ${parseCommand(text).args[0] ?? ''}`.trim() : 'run execute', text.startsWith('/') ? parseCommand(text).args.slice(1) : [text]); render(); return; } if (chunk === '\x7f') { if (palette && group) { group = ''; selected = 0; } else input = input.slice(0, -1); render(); return; } if (chunk === '\x1b[A' || chunk === '\x1b[D') { selected = Math.max(0, selected - 1); render(); return; } if (chunk === '\x1b[B' || chunk === '\x1b[C') { selected = Math.min((group ? commandGroups[group] : groups).length - 1, selected + 1); render(); return; } if (!palette && chunk >= ' ' && chunk <= '~') { input += chunk; render(); } }); });
}
if (process.argv[1]?.endsWith('tui.ts')) await startTui();

