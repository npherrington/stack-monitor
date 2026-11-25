import { AGENT_IDS } from '../../config/schema.ts'
import type { AgentId } from '../../types.ts'
import type { AgentAdapter } from '../adapter.ts'
import { claude } from './claude.ts'
import { opencode } from './opencode.ts'

export const ADAPTERS: Record<AgentId, AgentAdapter> = { claude, opencode }

// In AGENT_IDS order, which is the order the page lists them and the default is picked in.
export function allAdapters(): AgentAdapter[] {
  return AGENT_IDS.map((id) => ADAPTERS[id])
}
