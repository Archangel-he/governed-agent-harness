import { releaseGate } from '../governance/release.js';
﻿import type {
  AgentVersion, CandidateExperiment, Execution, ReleaseDecision, TrajectoryEvent,
} from '../contracts/domain.js';

export class InMemoryAgentRuntime {
  readonly events: TrajectoryEvent[] = [];
  readonly experiments: CandidateExperiment[] = [];

  startExecution(agentId: string, version: AgentVersion, revision = 0): Execution {
    const execution: Execution = {
      id: crypto.randomUUID(), agentId, agentVersionId: version.id,
      status: 'running', rootRevisionBefore: revision,
    };
    this.record({
      id: crypto.randomUUID(), executionId: execution.id, agentId,
      agentVersionId: version.id, operationId: execution.id,
      type: 'execution/started', status: 'started',
    });
    return execution;
  }

  record(event: TrajectoryEvent): void { this.events.push(event); }

  finishExecution(execution: Execution, status: Execution['status'], revision?: number): void {
    execution.status = status;
    if (revision !== undefined) execution.rootRevisionAfter = revision;
    this.record({
      id: crypto.randomUUID(), executionId: execution.id, agentId: execution.agentId,
      agentVersionId: execution.agentVersionId, operationId: execution.id,
      type: 'execution/finished', status: status === 'completed' ? 'succeeded' : status === 'cancelled' ? 'cancelled' : 'failed',
    });
  }

  decideRelease(candidate: CandidateExperiment, agentScore: number, threshold: number): ReleaseDecision {
    return releaseGate(candidate,agentScore,threshold);
  }
}

