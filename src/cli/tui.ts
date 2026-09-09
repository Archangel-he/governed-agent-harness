import {createInterface} from 'node:readline/promises';
import {stdin as input, stdout as output} from 'node:process';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {assembleAgent} from '../agent.js';
import {governanceReport} from '../governance/report.js';
import {toolAgentTemplate} from '../templates/tool-agent.js';

export interface ParsedCommand {name: string; args: string[]}
export function parseCommand(line: string): ParsedCommand { const parts = line.trim().replace(/^\//, '').split(/\s+/).filter(Boolean); return {name: parts[0] ?? '', args: parts.slice(1)} }

export async function startTui(root = mkdtempSync(join(tmpdir(), 'agent-tui-'))): Promise<void> {
  const definition = {...toolAgentTemplate(), agentId: 'tui-agent'};
  const agent = assembleAgent(root, definition);
  let last: Awaited<ReturnType<typeof agent.run>> | undefined;
  let lastInput: string | undefined;
  const rl = createInterface({input, output, historySize: 100});
  const commands: Record<string, (args: string[]) => Promise<void> | void> = {
    help: () => console.log('/run <text>  /status  /trace  /memory  /eval  /governance  /plugins  /topology  /quit'),
    run: async args => { if (!args.length) { console.log('Usage: /run <input>'); return; } lastInput = args.join(' '); last = await agent.run(crypto.randomUUID(), lastInput); console.log(JSON.stringify({status: last.status, output: last.output, error: last.error}, null, 2)); },
    status: () => console.log(JSON.stringify({agentId: agent.version.agentDefinitionId, version: agent.version.id, lastExecution: last?.executionId ?? null, lastStatus: last?.status ?? 'idle', memoryMode: definition.memoryMode ?? 'stateless', pluginCount: definition.plugins.length}, null, 2)),
    trace: () => console.log(JSON.stringify(last?.trace ?? null, null, 2)),
    memory: () => console.log(JSON.stringify({mode: definition.memoryMode ?? 'stateless', wiki: agent.wiki.pinned('agent', definition.agentId), episodes: agent.episodes.list().length}, null, 2)),
    eval: async () => { if (!last || lastInput === undefined) { console.log('No execution yet'); return; } console.log(JSON.stringify(await agent.evaluate(last, lastInput), null, 2)); },
    governance: () => console.log(JSON.stringify(last ? governanceReport(last.trace, new Set(definition.plugins.map(plugin => plugin.manifest.id))) : null, null, 2)),
    plugins: () => console.log(JSON.stringify(definition.plugins.map(plugin => plugin.manifest), null, 2)),
    topology: () => console.log(JSON.stringify(agent.version.topology, null, 2)),
    quit: () => rl.close(), exit: () => rl.close()
  };
  console.log('Agent Governance TUI'); commands.help([]);
  while (true) { const command = parseCommand(await rl.question('› ')); if (!command.name) continue; const handler = commands[command.name]; if (!handler) { console.log(`Unknown command: /${command.name}. Use /help`); continue; } await handler(command.args); if (command.name === 'quit' || command.name === 'exit') break; }
}
if (process.argv[1]?.endsWith('tui.ts')) await startTui();
