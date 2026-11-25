import { readOverview } from '../core/agents/detect.ts'
import {
  listRuns,
  readRun,
  RunIdRequest,
  RunsRequest,
  startRun,
  StartRunSchema,
  stopRun,
} from '../core/agents/runs.ts'
import { runsDir } from '../core/agents/run-files.ts'
import {
  AgentSettingsSchema,
  readAgentSettings,
  saveAgentSettings,
} from '../core/agents/settings.ts'
import {
  DraftSkillRequest,
  ImprovePromptRequest,
  listSkills,
} from '../core/agents/skills.ts'
import {
  runClaudeWorkflow,
  RunClaudeWorkflowSchema,
} from '../core/agents/claude-workflows.ts'
import { draftSkill, improveText, runWorkflow } from '../core/agents/starts.ts'
import {
  deleteWorkflow,
  DeleteWorkflowRequest,
  listWorkflows,
  RunWorkflowRequest,
  saveWorkflow,
  SaveWorkflowRequest,
  WorkflowsRequest,
} from '../core/agents/workflows.ts'
import type { Health } from '../core/monitor-address.ts'
import {
  addRepo,
  AddRepoRequest,
  readRepoStatuses,
  removeRepo,
  RemoveRepoRequest,
  renameRepo,
  RenameRepoRequest,
  ScanRequest,
} from '../core/repos.ts'
import { scanFolder } from '../core/scan.ts'
import {
  RepoRootRequest,
  trackedRepo,
  type SaveOutcome,
  type Unlisted,
} from '../core/config/sections.ts'
import {
  readRepoStack,
  saveRepoStack,
  SaveStackRequest,
} from '../core/stack/config.ts'
import { detectServices } from '../core/stack/detect.ts'
import { readRepoList, type Tracking } from '../core/settings.ts'
import { failure, type ActionResult } from '../core/types.ts'
import { readCheckouts } from '../core/worktrees/checkouts.ts'
import {
  readRepoWorktrees,
  saveRepoWorktrees,
  SaveWorktreesRequest,
} from '../core/worktrees/config.ts'
import {
  createWorktree,
  CreateWorktreeRequest,
} from '../core/worktrees/create.ts'
import { detectWorktreeCommands } from '../core/worktrees/detect.ts'
import { route, type Reply, type Routes } from './http.ts'

// Of the largest body a route takes: a repo's stack, or a run's four prompts.
export const MAX_BODY_BYTES = 64 * 1024

// 200 when the action was done, 409 when core refused it.
function settled(result: ActionResult): Reply {
  return [result.ok ? 200 : 409, result]
}

// A config save: 400 when the config it would make fails the schema.
function savedConfig(saved: SaveOutcome): Reply {
  return 'invalid' in saved ? [400, failure(saved.invalid)] : settled(saved)
}

// A read that needs the list, when the settings file can't be read.
function unlisted({ problem }: { problem: string }): Reply {
  return [500, failure(problem)]
}

// A read for one repo, when the list can't be read (500) or doesn't have it (409).
function notRead(why: Unlisted): Reply {
  return 'problem' in why ? unlisted(why) : [409, failure(why.refused)]
}

// tracking.seed: the repo the monitor was started for, the whole list until the settings file is
// first written.
export function makeRoutes(tracking: Tracking): Routes {
  return {
    'GET /api/health': async () => {
      const health: Health = {
        app: 'stack-monitor',
        root: tracking.seed,
        pid: process.pid,
      }
      return [200, health]
    },
    'GET /api/repos': async () => {
      const statuses = await readRepoStatuses(tracking)
      return 'problem' in statuses ? unlisted(statuses) : [200, statuses.repos]
    },
    'POST /api/repos': route(AddRepoRequest, '{ path, name? }', async (body) =>
      settled(await addRepo(tracking, body)),
    ),
    'POST /api/repos/remove': route(
      RemoveRepoRequest,
      '{ root }',
      async (body) => settled(await removeRepo(tracking, body)),
    ),
    'POST /api/repos/rename': route(
      RenameRepoRequest,
      '{ root, name }',
      async (body) => settled(await renameRepo(tracking, body)),
    ),
    'GET /api/repos/scan': route(
      ScanRequest,
      '?folder=',
      async ({ folder }) => {
        const list = readRepoList(tracking.settings, tracking.seed)
        if ('problem' in list) return unlisted(list)
        const tracked = new Set(list.repos.map((repo) => repo.root))
        const scanned = await scanFolder(folder, tracked)
        return 'error' in scanned
          ? [400, failure(scanned.error)]
          : [200, scanned]
      },
    ),
    'GET /api/repos/stack': route(
      RepoRootRequest,
      '?root=',
      async ({ root }) => {
        const stack = readRepoStack(tracking, root)
        return 'root' in stack ? [200, stack] : notRead(stack)
      },
    ),
    'POST /api/repos/stack': route(
      SaveStackRequest,
      '{ root, stack }',
      async (body) => savedConfig(await saveRepoStack(tracking, body)),
    ),
    'GET /api/repos/detect': route(
      RepoRootRequest,
      '?root=',
      async ({ root }) => {
        const repo = trackedRepo(tracking, root)
        return 'root' in repo
          ? [200, await detectServices(repo.root)]
          : notRead(repo)
      },
    ),
    'GET /api/repos/worktrees': route(
      RepoRootRequest,
      '?root=',
      async ({ root }) => {
        const worktrees = readRepoWorktrees(tracking, root)
        return 'root' in worktrees ? [200, worktrees] : notRead(worktrees)
      },
    ),
    'POST /api/repos/worktrees': route(
      SaveWorktreesRequest,
      '{ root, worktrees }',
      async (body) => savedConfig(await saveRepoWorktrees(tracking, body)),
    ),
    'GET /api/repos/detect-worktrees': route(
      RepoRootRequest,
      '?root=',
      async ({ root }) => {
        const repo = trackedRepo(tracking, root)
        return 'root' in repo
          ? [200, await detectWorktreeCommands(repo.root)]
          : notRead(repo)
      },
    ),
    'POST /api/worktrees': route(
      CreateWorktreeRequest,
      '{ root, branch }',
      async (body) => settled(await createWorktree(tracking, body)),
    ),
    'GET /api/checkouts': async () => {
      const snapshot = await readCheckouts(tracking)
      return 'problem' in snapshot ? unlisted(snapshot) : [200, snapshot]
    },
    'GET /api/agents': async () => {
      const settings = readAgentSettings(tracking.settings)
      return 'problem' in settings
        ? unlisted(settings)
        : [200, await readOverview(settings)]
    },
    'POST /api/agents/settings': route(
      AgentSettingsSchema,
      '{ default?, designer?, agents? }',
      async (body) => settled(await saveAgentSettings(tracking, body)),
    ),
    'GET /api/runs': route(RunsRequest, '?root=', async ({ root }) => {
      if (root === undefined) return [200, await listRuns(runsDir())]
      const repo = trackedRepo(tracking, root)
      return 'root' in repo
        ? [200, await listRuns(runsDir(), repo.root)]
        : notRead(repo)
    }),
    'GET /api/runs/detail': route(RunIdRequest, '?id=', async ({ id }) => {
      const detail = await readRun(id, runsDir())
      return detail === null
        ? [404, failure(`There's no run ${id}`)]
        : [200, detail]
    }),
    'POST /api/runs': route(
      StartRunSchema,
      '{ checkout, title?, permissions, steps }',
      async (body) => settled(await startRun(tracking, body, 'task')),
    ),
    'POST /api/runs/stop': route(RunIdRequest, '{ id }', async ({ id }) =>
      settled(await stopRun(id, runsDir())),
    ),
    'GET /api/skills': route(RepoRootRequest, '?root=', async ({ root }) => {
      const repo = trackedRepo(tracking, root)
      return 'root' in repo ? [200, listSkills(repo.root)] : notRead(repo)
    }),
    'POST /api/skills/draft': route(
      DraftSkillRequest,
      '{ checkout, name, purpose, triggers, agent?, model? }',
      async (body) => settled(await draftSkill(tracking, body)),
    ),
    'POST /api/prompts/improve': route(
      ImprovePromptRequest,
      '{ checkout, kind, text, agent?, model? }',
      async (body) => settled(await improveText(tracking, body)),
    ),
    'GET /api/workflows': route(
      WorkflowsRequest,
      '?root=',
      async ({ root }) => {
        const repo = trackedRepo(tracking, root)
        return 'root' in repo ? [200, listWorkflows(repo.root)] : notRead(repo)
      },
    ),
    'POST /api/workflows/save': route(
      SaveWorkflowRequest,
      '{ root, workflow, replacing? }',
      async ({ root, workflow, replacing }) => {
        const repo = trackedRepo(tracking, root)
        return 'root' in repo
          ? settled(await saveWorkflow(repo.root, workflow, replacing))
          : notRead(repo)
      },
    ),
    'POST /api/workflows/delete': route(
      DeleteWorkflowRequest,
      '{ root, name }',
      async ({ root, name }) => {
        const repo = trackedRepo(tracking, root)
        return 'root' in repo
          ? settled(await deleteWorkflow(repo.root, name))
          : notRead(repo)
      },
    ),
    'POST /api/workflows/run': route(
      RunWorkflowRequest,
      '{ checkout, name }',
      async (body) => settled(await runWorkflow(tracking, body)),
    ),
    'POST /api/workflows/run-claude': route(
      RunClaudeWorkflowSchema,
      '{ checkout, name, testRun?, notes?, argument?, permissions? }',
      async (body) => settled(await runClaudeWorkflow(tracking, body)),
    ),
  }
}
