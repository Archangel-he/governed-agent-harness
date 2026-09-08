import type { Execution } from '../contracts/domain.js';
import type { RecoveryRecord } from '../contracts/runtime.js';

export function recoverExecution(execution: Execution, attempts: number, retryable: boolean, reason: string): RecoveryRecord {
  if (execution.status === 'completed') return { executionId: execution.id, status: 'recovered', reason: 'already completed', attempts };
  if (!retryable) { execution.status = 'failed'; return { executionId: execution.id, status: 'terminal', reason, attempts }; }
  execution.status = 'queued';
  return { executionId: execution.id, status: 'retryable', reason, attempts };
}
