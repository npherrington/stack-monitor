// The two Claude Code sessions the board starts: one that works a ticket, and product management
// mode, which files tickets. Each gets the monitor's MCP server pointed at this board's file, and
// may call a few of its tools without asking. They start from the page only.
import { z } from 'zod'

import { listSkills, SkillName } from '../agents/skills.ts'
import { trackedRepo } from '../config/sections.ts'
import { BranchName } from '../fields.ts'
import { mcpLaunch, toolRule } from '../mcp-launch.ts'
import { PathText } from '../repos.ts'
import type { Tracking } from '../settings.ts'
import { openTerminal } from '../terminals/sessions.ts'
import { oneLine } from '../terminals/task-text.ts'
import { failure, type ActionResult, type StartedSession } from '../types.ts'
import { listWorktrees } from '../worktrees/clone.ts'
import { createWorktree } from '../worktrees/create.ts'
import type { BoardContext } from './db.ts'
import {
  PRODUCT_PROMPT,
  PRODUCT_TOOLS,
  productMessage,
  WORK_TOOLS,
  workTicketMessage,
} from './prompts.ts'
import { readBoard, readTicket } from './read.ts'
import { Id } from './schema.ts'

export const WorkTicketRequest = z.strictObject({
  project: Id,
  number: Id,
  root: PathText,
  where: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('new'), branch: BranchName }),
    z.strictObject({ kind: z.literal('existing'), path: PathText }),
  ]),
  skill: SkillName.nullable(),
})

export const ProductSessionRequest = z.strictObject({
  project: Id,
  root: PathText,
  path: PathText,
})

function refused(message: string): StartedSession {
  return { ...failure(message), session: null }
}

// The project as the board has it now, when it can be worked in.
function openProject(
  id: number,
  board: BoardContext,
): { name: string; prefix: string } | { refused: string } {
  const overview = readBoard(board)
  if ('problem' in overview) return { refused: overview.problem }
  const project = overview.projects.find((each) => each.id === id)
  if (project === undefined) return { refused: `There's no project ${id}` }
  return project.archived
    ? { refused: `${project.name} is archived. Restore it first.` }
    : project
}

export async function workTicket(
  tracking: Tracking,
  request: z.output<typeof WorkTicketRequest>,
  board: BoardContext,
): Promise<StartedSession> {
  const repo = trackedRepo(tracking, request.root)
  if ('problem' in repo) return refused(repo.problem)
  if ('refused' in repo) return refused(repo.refused)
  const project = openProject(request.project, board)
  if ('refused' in project) return refused(project.refused)
  const ticket = readTicket(request.project, request.number, board)
  if (ticket === null) {
    return refused(`There's no ticket ${project.prefix}-${request.number}`)
  }
  if ('problem' in ticket) return refused(ticket.problem)
  if (ticket.archived) {
    return refused(`${ticket.key} is archived. Restore it to work it.`)
  }
  const { where } = request
  const skill =
    request.skill === null
      ? null
      : listSkills(repo.root).find((each) => each.name === request.skill)
  if (skill === undefined) {
    return refused(`${repo.root} has no skill named ${request.skill}`)
  }

  // Everything that can be refused without touching the repo is above: a new worktree is only
  // made once the ticket and the skill are known to be there.
  let path: string
  let made: ActionResult | null = null
  if (where.kind === 'existing') {
    path = where.path
  } else {
    made = await createWorktree(tracking, {
      root: repo.root,
      branch: where.branch,
    })
    if (!made.ok) return { ...made, session: null }
    // Found by its branch: a repo's own create command decides where its worktrees go.
    const worktree = (await listWorktrees(repo.root)).find(
      (each) => each.branch === where.branch,
    )
    if (worktree === undefined) {
      return refused(
        `${made.message}, but no worktree is on ${where.branch}, so there's nowhere to open the session`,
      )
    }
    path = worktree.path
  }

  const opened = await openTerminal(
    tracking,
    { root: repo.root, path, kind: 'claude' },
    {
      kind: 'ticket',
      title: ticket.key,
      message: workTicketMessage(
        ticket,
        project.name,
        skill,
        where.kind === 'new' && made !== null
          ? { branch: where.branch, installLog: made.log }
          : null,
      ),
      mcp: mcpLaunch(board.file),
      allowedTools: WORK_TOOLS.map(toolRule),
    },
  )
  if ('ok' in opened) {
    return refused(
      made === null
        ? opened.message
        : `Made ${path}, but couldn't open Claude Code in it: ${opened.message}`,
    )
  }
  return {
    ok: true,
    message:
      made === null
        ? `Opened ${ticket.key} in ${opened.path}`
        : `${made.message}. Opened ${ticket.key} there`,
    log: made?.log ?? null,
    session: opened,
  }
}

export async function startProductSession(
  tracking: Tracking,
  request: z.output<typeof ProductSessionRequest>,
  board: BoardContext,
): Promise<StartedSession> {
  const repo = trackedRepo(tracking, request.root)
  if ('problem' in repo) return refused(repo.problem)
  if ('refused' in repo) return refused(repo.refused)
  const project = openProject(request.project, board)
  if ('refused' in project) return refused(project.refused)
  const opened = await openTerminal(
    tracking,
    { root: repo.root, path: request.path, kind: 'claude' },
    {
      kind: 'product',
      title: `Product: ${oneLine(project.name, 40)}`,
      message: productMessage(project),
      systemPrompt: PRODUCT_PROMPT,
      mcp: mcpLaunch(board.file),
      allowedTools: PRODUCT_TOOLS.map(toolRule),
    },
  )
  if ('ok' in opened) return refused(opened.message)
  return {
    ok: true,
    message: `Opened product management for ${project.name} in ${opened.path}`,
    log: null,
    session: opened,
  }
}
