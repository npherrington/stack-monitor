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
import {
  addLineComment,
  DeleteCommentRequest,
  deletePendingComment,
  JobLogRequest,
  LineCommentRequest,
  listPulls,
  PullListRequest,
  PullRequest,
  readChecks,
  readJobLog,
  readPull,
  replyToThread,
  ReplyRequest,
  RerunRequest,
  rerunFailedJobs,
  ResolveRequest,
  resolveThread,
  submitReview,
  SubmitReviewRequest,
} from '../core/github/github.ts'
import {
  deleteStackMap,
  DeleteStackMapRequest,
  featureMapRepo,
  readFeatureMap,
  readStackMap,
  saveStackMap,
  SaveStackMapRequest,
  StackMapQuery,
} from '../core/feature-map/maps.ts'
import { boardContext, boardFile, type BoardContext } from '../core/board/db.ts'
import {
  ProductSessionRequest,
  startProductSession,
  workTicket,
  WorkTicketRequest,
} from '../core/board/sessions.ts'
import { deleteLabel, saveLabel } from '../core/board/labels.ts'
import {
  archiveProject,
  deleteColumn,
  deleteProject,
  reorderColumns,
  saveColumn,
  saveProject,
} from '../core/board/projects.ts'
import {
  readArchivedTickets,
  readBoard,
  readProjectBoard,
  readTicket,
} from '../core/board/read.ts'
import {
  ArchivedQuery,
  ArchiveRequest,
  CreateTicketRequest,
  DeleteColumnRequest,
  IdRequest,
  MoveTicketRequest,
  ProjectQuery,
  ReorderColumnsRequest,
  SaveColumnRequest,
  SaveCommentRequest,
  SaveLabelRequest,
  SaveProjectRequest,
  TicketQuery,
  UpdateTicketRequest,
} from '../core/board/schema.ts'
import {
  archiveTicket,
  createTicket,
  deleteComment,
  deleteTicket,
  moveTicket,
  saveComment,
  updateTicket,
} from '../core/board/tickets.ts'
import {
  AgenticReviewRequest,
  startAgenticReview,
} from '../core/github/review-session.ts'
import { MONITOR_HOME, type Health } from '../core/monitor-address.ts'
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
  deleteSchedule,
  listSchedules,
  runScheduleNow,
  saveSchedule,
  scheduleContext,
  type ScheduleContext,
} from '../core/schedules/schedules.ts'
import {
  SaveScheduleSchema,
  ScheduleIdRequest,
  schedulesDir,
} from '../core/schedules/store.ts'
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
import {
  failure,
  type ActionResult,
  type ArchivedTickets,
  type BoardOverview,
  type ProjectBoard,
  type TerminalsSnapshot,
  type TicketDetail,
} from '../core/types.ts'
import {
  closeTerminal,
  listTerminals,
  OpenTerminalRequest,
  openTerminal,
  TerminalIdRequest,
} from '../core/terminals/sessions.ts'
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
import {
  removeWorktree,
  RemoveWorktreeRequest,
} from '../core/worktrees/remove.ts'
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

type BoardRead = BoardOverview | ProjectBoard | TicketDetail | ArchivedTickets

// A board read: 500 when the file can't be read, 404 when it holds no such row.
function boardRead(
  found: BoardRead | { problem: string } | null,
  missing: string,
): Reply {
  if (found === null) return [404, failure(missing)]
  return 'problem' in found ? unlisted(found) : [200, found]
}

// tracking.seed: the repo the monitor was started for, the whole list until the settings file is
// first written.
export function makeRoutes(
  tracking: Tracking,
  schedules: ScheduleContext = scheduleContext(schedulesDir()),
  board: BoardContext = boardContext(boardFile()),
): Routes {
  return {
    'GET /api/health': async () => {
      const health: Health = {
        app: 'stack-monitor',
        root: tracking.seed,
        pid: process.pid,
        home: MONITOR_HOME,
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
    'POST /api/worktrees/remove': route(
      RemoveWorktreeRequest,
      '{ root, path, deleteBranch? }',
      async (body) => settled(await removeWorktree(tracking, body)),
    ),
    'GET /api/terminals': async () => {
      const snapshot: TerminalsSnapshot = { sessions: listTerminals() }
      return [200, snapshot]
    },
    'POST /api/terminals': route(
      OpenTerminalRequest,
      "{ root, path, kind?: 'claude' | 'shell' }",
      async (body) => {
        const opened = await openTerminal(tracking, body)
        return 'ok' in opened ? settled(opened) : [200, opened]
      },
    ),
    'POST /api/terminals/close': route(
      TerminalIdRequest,
      '{ id }',
      async ({ id }) => settled(closeTerminal(id)),
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
    'GET /api/feature-map': route(
      RepoRootRequest,
      '?root=',
      async ({ root }) => {
        const repo = featureMapRepo(tracking, root)
        return 'maps' in repo ? [200, readFeatureMap(repo)] : notRead(repo)
      },
    ),
    'GET /api/feature-map/map': route(
      StackMapQuery,
      '?root=&name=',
      async ({ root, name }) => {
        const repo = featureMapRepo(tracking, root)
        if (!('maps' in repo)) return notRead(repo)
        const map = readStackMap(repo, name)
        if (map === null) return [404, failure(`There's no map ${name}`)]
        return 'version' in map ? [200, map] : notRead(map)
      },
    ),
    'POST /api/feature-map/save': route(
      SaveStackMapRequest,
      '{ root, name, map, replacing? }',
      async ({ root, name, map, replacing }) => {
        const repo = featureMapRepo(tracking, root)
        return 'maps' in repo
          ? settled(await saveStackMap(repo, name, map, replacing))
          : notRead(repo)
      },
    ),
    'POST /api/feature-map/delete': route(
      DeleteStackMapRequest,
      '{ root, name }',
      async ({ root, name }) => {
        const repo = featureMapRepo(tracking, root)
        return 'maps' in repo
          ? settled(await deleteStackMap(repo, name))
          : notRead(repo)
      },
    ),
    'GET /api/github/pulls': route(
      PullListRequest,
      '?root=',
      async ({ root }) => {
        const list = await listPulls(tracking, root)
        return 'pulls' in list ? [200, list] : notRead(list)
      },
    ),
    'GET /api/github/pull': route(
      PullRequest,
      '?root=&number=',
      async ({ root, number }) => {
        const pull = await readPull(tracking, root, number)
        return 'files' in pull ? [200, pull] : notRead(pull)
      },
    ),
    'GET /api/github/checks': route(
      PullRequest,
      '?root=&number=',
      async ({ root, number }) => {
        const checks = await readChecks(tracking, root, number)
        return 'groups' in checks ? [200, checks] : notRead(checks)
      },
    ),
    'GET /api/github/checks/log': route(
      JobLogRequest,
      '?root=&job=',
      async ({ root, job }) => {
        const log = await readJobLog(tracking, root, job)
        return 'lines' in log ? [200, log] : notRead(log)
      },
    ),
    'POST /api/github/checks/rerun': route(
      RerunRequest,
      '{ root, number, run }',
      async (body) => settled(await rerunFailedJobs(tracking, body)),
    ),
    'POST /api/github/comment': route(
      LineCommentRequest,
      "{ root, number, path, line, side: 'LEFT' | 'RIGHT', body }",
      async (body) => settled(await addLineComment(tracking, body)),
    ),
    'POST /api/github/comment/delete': route(
      DeleteCommentRequest,
      '{ root, comment }',
      async (body) => settled(await deletePendingComment(tracking, body)),
    ),
    'POST /api/github/reply': route(
      ReplyRequest,
      '{ root, number, thread, body }',
      async (body) => settled(await replyToThread(tracking, body)),
    ),
    'POST /api/github/resolve': route(
      ResolveRequest,
      '{ root, thread, resolved }',
      async (body) => settled(await resolveThread(tracking, body)),
    ),
    'POST /api/github/review': route(
      SubmitReviewRequest,
      "{ root, number, event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT', body? }",
      async (body) => settled(await submitReview(tracking, body)),
    ),
    'POST /api/github/agentic-review': route(
      AgenticReviewRequest,
      '{ root, number, path, skill, focus? }',
      async (body) => settled(await startAgenticReview(tracking, body)),
    ),
    'GET /api/schedules': async () => {
      const list = await listSchedules(tracking, schedules)
      return 'problem' in list ? unlisted(list) : [200, list]
    },
    'POST /api/schedules/save': route(
      SaveScheduleSchema,
      '{ id?, name, cron, checkout, enabled, fireFrom, task }',
      async (body) => settled(await saveSchedule(tracking, body, schedules)),
    ),
    'POST /api/schedules/delete': route(
      ScheduleIdRequest,
      '{ id }',
      async ({ id }) => settled(await deleteSchedule(id, schedules)),
    ),
    'POST /api/schedules/run': route(
      ScheduleIdRequest,
      '{ id }',
      async ({ id }) => settled(await runScheduleNow(tracking, id, schedules)),
    ),
    'GET /api/board': async () => boardRead(readBoard(board), ''),
    'GET /api/board/project': route(ProjectQuery, '?id=', async ({ id }) =>
      boardRead(readProjectBoard(id, board), `There's no project ${id}`),
    ),
    'GET /api/board/ticket': route(
      TicketQuery,
      '?project=&number=',
      async ({ project, number }) =>
        boardRead(
          readTicket(project, number, board),
          `There's no ticket ${number} in that project`,
        ),
    ),
    'GET /api/board/archived': route(
      ArchivedQuery,
      '?project=',
      async ({ project }) =>
        boardRead(
          readArchivedTickets(project, board),
          `There's no project ${project}`,
        ),
    ),
    'POST /api/board/projects/save': route(
      SaveProjectRequest,
      '{ id?, name, prefix?, colour? }',
      async (body) => settled(saveProject(body, board)),
    ),
    'POST /api/board/projects/archive': route(
      ArchiveRequest,
      '{ id, archived }',
      async (body) => settled(archiveProject(body, board)),
    ),
    'POST /api/board/projects/delete': route(
      IdRequest,
      '{ id }',
      async ({ id }) => settled(deleteProject(id, board)),
    ),
    'POST /api/board/columns/save': route(
      SaveColumnRequest,
      '{ id?, project, name, colour? }',
      async (body) => settled(saveColumn(body, board)),
    ),
    'POST /api/board/columns/reorder': route(
      ReorderColumnsRequest,
      '{ project, order }',
      async (body) => settled(reorderColumns(body, board)),
    ),
    'POST /api/board/columns/delete': route(
      DeleteColumnRequest,
      '{ id, moveTo? }',
      async (body) => settled(deleteColumn(body, board)),
    ),
    'POST /api/board/labels/save': route(
      SaveLabelRequest,
      '{ id?, project, name, colour? }',
      async (body) => settled(saveLabel(body, board)),
    ),
    'POST /api/board/labels/delete': route(
      IdRequest,
      '{ id }',
      async ({ id }) => settled(deleteLabel(id, board)),
    ),
    'POST /api/board/tickets/create': route(
      CreateTicketRequest,
      '{ project, column?, title, description?, priority?, dueOn?, labels? }',
      async (body) => settled(createTicket(body, board)),
    ),
    'POST /api/board/tickets/update': route(
      UpdateTicketRequest,
      '{ id, title?, description?, priority?, dueOn?, labels? }',
      async (body) => settled(updateTicket(body, board)),
    ),
    'POST /api/board/tickets/move': route(
      MoveTicketRequest,
      "{ id, column, beside, place: 'before' | 'after' }",
      async (body) => settled(moveTicket(body, board)),
    ),
    'POST /api/board/tickets/archive': route(
      ArchiveRequest,
      '{ id, archived }',
      async (body) => settled(archiveTicket(body, board)),
    ),
    'POST /api/board/tickets/delete': route(
      IdRequest,
      '{ id }',
      async ({ id }) => settled(deleteTicket(id, board)),
    ),
    'POST /api/board/comments/save': route(
      SaveCommentRequest,
      '{ id?, ticket, body }',
      async (body) => settled(saveComment(body, board)),
    ),
    'POST /api/board/comments/delete': route(
      IdRequest,
      '{ id }',
      async ({ id }) => settled(deleteComment(id, board)),
    ),
    'POST /api/board/work': route(
      WorkTicketRequest,
      "{ project, number, root, where: { kind: 'new', branch } | { kind: 'existing', path }, skill }",
      async (body) => settled(await workTicket(tracking, body, board)),
    ),
    'POST /api/board/product': route(
      ProductSessionRequest,
      '{ project, root, path }',
      async (body) => settled(await startProductSession(tracking, body, board)),
    ),
  }
}
