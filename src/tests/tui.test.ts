import test from 'node:test';import assert from 'node:assert/strict';import {parseCommand} from '../cli/tui.js';
test('TUI parses slash commands and arguments',()=>{assert.deepEqual(parseCommand('/run hello world'),{name:'run',args:['hello','world']});assert.deepEqual(parseCommand('  /status '),{name:'status',args:[]});assert.deepEqual(parseCommand(''),{name:'',args:[]})});
