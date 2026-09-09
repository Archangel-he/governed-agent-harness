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

const esc = '\x1b[';
const clear = () => stdout.write(`${esc}2J${esc}H`);
const color = (code: string, value: string) => `${esc}${code}m${value}${esc}0m`;

export async function startTui(root = mkdtempSync(join(tmpdir(), 'agent-tui-'))): Promise<void> {
  const definition = {...toolAgentTemplate(), agentId: 'supreme-agent'};
  const agent = assembleAgent(root, definition);
  let last: Awaited<ReturnType<typeof agent.run>> | undefined;
  let lastInput: string | undefined;
  let outputLines: string[] = ['Ready. Type a task or / for commands.'];
  let input = '';
  let palette = false;
  let group = '';
  let selected = 0;
  const groups = Object.keys(commandGroups);
  const render = () => {
    clear();
    const width = Math.max(60, stdout.columns || 80);
    const line = '─'.repeat(width);
    stdout.write(`${color('1;36', ' Supreme Agent')}  ${definition.agentId}  ${agent.version.id}  ${definition.memoryMode ?? 'stateless'}  ${last ? color('32', last.status) : color('90', 'idle')}\n${line}\n`);
    stdout.write(outputLines.slice(-Math.max(5, (stdout.rows || 24) - 9)).join('\n') + '\n');
    stdout.write(`${line}\n${palette ? renderPalette() : `${color('36', '›')} ${input}`}\n${line}\n${color('90', 'Enter run  / commands  ↑↓ select  Esc close  Ctrl+C quit')}`);
  };
  const renderPalette = () => {
    if (!group) return `${color('1;33', 'COMMANDS')}  ${groups.map((name, index) => index === selected ? color('7', ` ${name} `) : ` ${name} `).join(' ')}`;
    const entries = commandGroups[group];
    return `${color('1;33', `/${group}`)}  ${entries.map((name, index) => index === selected ? color('7', ` ${name} `) : ` ${name} `).join(' ')}  ${color('90', '(Backspace: groups)')}`;
  };
  const log = (value: unknown) => { outputLines = [...outputLines, typeof value === 'string' ? value : JSON.stringify(value, null, 2)]; };
  const execute = async (command: string, args: string[]): Promise<void> => {
    if (command === 'run execute') { lastInput = args.join(' '); if (!lastInput) return log('Usage: /run execute <input>'); last = await agent.run(crypto.randomUUID(), lastInput); return log({status: last.status, output: last.output, error: last.error}); }
    if (command === 'run repeat') return lastInput ? execute('run execute', [lastInput]) : log('No previous input');
    if (command === 'team status') return log({leader: definition.agentId, members: [], mode: 'single-agent'});
    if (command === 'team members') return log('No members registered.');
    if (command === 'team inbox') return log('Inbox is empty.');
    if (command === 'trace last') return log(last?.trace ?? null);
    if (command === 'trace events') return log(last?.trace.events ?? []);
    if (command === 'memory wiki') return log({mode: definition.memoryMode ?? 'stateless', pinned: agent.wiki.pinned('agent', definition.agentId)});
    if (command === 'memory episodes') return log(agent.episodes.list());
    if (command === 'memory search') return log('Stateless mode: no episodic search.');
    if (command === 'eval last') return last && lastInput ? log(await agent.evaluate(last, lastInput)) : log('No execution yet');
    if (command === 'eval dataset') return log({evaluationDigest: agent.version.evaluationDigest});
    if (command === 'eval feedback') return log('Feedback is provided through the EvaluationPackage.');
    if (command === 'governance report') return log(last ? governanceReport(last.trace, new Set(definition.plugins.map(plugin => plugin.manifest.id))) : null);
    if (command === 'governance proposals') return log('No pending proposals.');
    if (command === 'system status') return log({agentId: definition.agentId, version: agent.version.id, lastExecution: last?.executionId ?? null, lastStatus: last?.status ?? 'idle', memoryMode: definition.memoryMode ?? 'stateless', pluginCount: definition.plugins.length});
    if (command === 'system plugins') return log(definition.plugins.map(plugin => plugin.manifest));
    if (command === 'system topology') return log(agent.version.topology);
  };
  const close = () => { if (stdin.isTTY) stdin.setRawMode(false); stdin.pause(); stdout.write(`${esc}2J${esc}H`); };
  return new Promise<void>(resolve => {
    stdin.setRawMode?.(true); stdin.resume(); stdin.setEncoding('utf8'); render();
    stdin.on('data', async (chunk: string) => {
      if (chunk === '\u0003') { close(); resolve(); return; }
      if (chunk === '\x1b') { palette = false; group = ''; selected = 0; render(); return; }
      if (chunk === '\r' || chunk === '\n') {
        if (!palette) { const text = input.trim(); input = ''; if (text.startsWith('/')) { const parsed = parseCommand(text); if (commandGroups[parsed.name]) { palette = true; group = parsed.name; selected = 0; } else await execute(parsed.name, parsed.args); } else if (text) await execute('run execute', [text]); render(); return; }
        const name = (group ? commandGroups[group] : groups)[selected]; if (!group) { group = name; selected = 0; } else { palette = false; await execute(`${group} ${name}`, []); group = ''; selected = 0; } render(); return;
      }
      if (chunk === '\x7f') { if (palette && group) { group = ''; selected = 0; } else input = input.slice(0, -1); render(); return; }
      if (chunk === '\x1b[A' || chunk === '\x1b[D') { selected = Math.max(0, selected - 1); render(); return; }
      if (chunk === '\x1b[B' || chunk === '\x1b[C') { selected = Math.min((group ? commandGroups[group] : groups).length - 1, selected + 1); render(); return; }
      if (!palette && chunk >= ' ' && chunk <= '~') { input += chunk; render(); }
    });
  });
}
if (process.argv[1]?.endsWith('tui.ts')) await startTui();

