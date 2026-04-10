/**
 * TD-08: Repository Layer Index
 * Central export point for all repository classes
 * Provides singleton instances for convenience
 */

import { AgentRunsRepository } from "./agent-runs";
import { CompaniesRepository } from "./companies";
import { GespTasksRepository } from "./gesp-tasks";

export { AgentRunsRepository, type AgentRunRecord } from "./agent-runs";
export { CompaniesRepository, type CompanyRecord } from "./companies";
export { GespTasksRepository, type GespTaskRecord } from "./gesp-tasks";

// Singleton instances for convenience
let _agentRuns: AgentRunsRepository | null = null;
let _companies: CompaniesRepository | null = null;
let _gespTasks: GespTasksRepository | null = null;

/**
 * Repository singleton factory
 * Usage: repositories.agentRuns.create(...), repositories.companies.getById(...)
 */
export const repositories = {
  get agentRuns() {
    return (_agentRuns ??= new AgentRunsRepository());
  },
  get companies() {
    return (_companies ??= new CompaniesRepository());
  },
  get gespTasks() {
    return (_gespTasks ??= new GespTasksRepository());
  },
};

/**
 * Alternative class instantiation for dependency injection patterns
 * Usage: new AgentRunsRepository(), new CompaniesRepository(), etc.
 */
export function createRepositories() {
  return {
    agentRuns: new AgentRunsRepository(),
    companies: new CompaniesRepository(),
    gespTasks: new GespTasksRepository(),
  };
}
