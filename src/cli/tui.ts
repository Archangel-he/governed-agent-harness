import {createInterface} from 'node:readline/promises';
import {stdin as input, stdout as output} from 'node:process';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {assembleAgent} from '../agent.js';
import {governanceReport} from '../governance/report.js';
import {toolAgentTemplate} from '../templates/tool-agent.js';

export interface ParsedCommand {name: string; args: string[]}
export type CommandGroup = Record<string, string[]>
export const commandGroups: CommandGroup = {
  run: ['execute', 'repeat'], team: ['status', 'members', 'inbox'], trace: ['last', 'events'],
  memory: ['wiki', 'episodes', 'search'], eval: ['last', 'dataset', 'feedback'],
  governance: ['report', 'proposals'], system: ['status', 'plugins', 'topology', 'help', 'quit']
};
export function parseCommand(line: string): ParsedCommand { const parts = line.trim().replace(/^\//, '').split(/\s+/).filter(Boolean); return {name: parts[0] ?? '', args: parts.slice(1)} }

export async function startTui(root = mkdtempSync(join(tmpdir(), 'agent-tui-'))): Promise<void> {
  const definition = {...toolAgentTemplate(), agentId: 'supreme-agent'};
  const agent = assembleAgent(root, definition);
  let last: Awaited<ReturnType<typeof agent.run>> | undefined;
  let lastInput: string | undefined;
  const rl = createInterface({input, output, historySize: 100});
  const printGroups = () => console.log(Object.entries(commandGroups).map(([group, commands]) => `/${group}  ${commands.join('  ')}`).join('\n'));
  const run = async (args: string[]) => { if (!args.length) { console.log('Usage: /run execute <input>'); return; } lastInput = args.join(' '); last = await agent.run(crypto.randomUUID(), lastInput); console.log(JSON.stringify({status: last.status, output: last.output, error: last.error}, null, 2)); };
  const commands: Record<string, (args: string[]) => Promise<void> | void> = {
    'run execute': run,
    'run repeat': async () => { if (lastInput) await run([lastInput]); else console.log('No previous input'); },
    'team status': () => console.log(JSON.stringify({leader: definition.agentId, members: [], mode: 'single-agent'}, null, 2)),
    'team members': () => console.log('No members registered.'), 'team inbox': () => console.log('Inbox is empty.'),
    'trace last': () => console.log(JSON.stringify(last?.trace ?? null, null, 2)), 'trace events': () => console.log(JSON.stringify(last?.trace.events ?? [], null, 2)),
    'memory wiki': () => console.log(JSON.stringify({mode: definition.memoryMode ?? 'stateless', pinned: agent.wiki.pinned('agent', definition.agentId)}, null, 2)),
    'memory episodes': () => console.log(JSON.stringify(agent.episodes.list(), null, 2)), 'memory search': () => console.log('Stateless mode: no episodic search.'),
    'eval last': async () => { if (!last || lastInput === undefined) { console.log('No execution yet'); return; } console.log(JSON.stringify(await agent.evaluate(last, lastInput), null, 2)); },
    'eval dataset': () => console.log(JSON.stringify({evaluationDigest: agent.version.evaluationDigest}, null, 2)), 'eval feedback': () => console.log('Feedback is provided through the EvaluationPackage.'),
    'governance report': () => console.log(JSON.stringify(last ? governanceReport(last.trace, new Set(definition.plugins.map(plugin => plugin.manifest.id))) : null, null, 2)),
    'governance proposals': () => console.log('No pending proposals.'),
    'system status': () => console.log(JSON.stringify({agentId: definition.agentId, version: agent.version.id, lastExecution: last?.executionId ?? null, lastStatus: last?.status ?? 'idle', memoryMode: definition.memoryMode ?? 'stateless', pluginCount: definition.plugins.length}, null, 2)),
    'system plugins': () => console.log(JSON.stringify(definition.plugins.map(plugin => plugin.manifest), null, 2)), 'system topology': () => console.log(JSON.stringify(agent.version.topology, null, 2)),
    'system help': printGroups, 'system quit': () => rl.close(), 'system exit': () => rl.close()
  };
  console.log('Supreme Agent TUI'); printGroups();
  let group = '';
  while (true) {
    const parsed = parseCommand(await rl.question(group ? `${group} › ` : '› '));
    if (!parsed.name) continue;
    if (!group && commandGroups[parsed.name]) { group = parsed.name; console.log(`${group}: ${commandGroups[group].join('  ')}`); continue; }
    const key = group ? `${group} ${parsed.name}` : parsed.name;
    if (parsed.name === 'back' && group) { group = ''; continue; }
    const handler = commands[key];
    if (!handler) { console.log(`Unknown command: /${key}. Use /system help or /back`); continue; }
    await handler(args);
    if (key === 'system quit' || key === 'system exit') break;
  }
}
if (process.argv[1]?.endsWith('tui.ts')) await startTui();

