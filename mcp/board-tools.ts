// The ticket board's tools. An agent names things the way a person does (a ticket by its key, a
// column or a label by its name); each tool turns those into ids and calls the core/board function
// the matching route calls. Nothing here deletes or archives, and nothing starts a run, a schedule
// or a session.
import { z } from 'zod'

import type { BoardContext } from '../core/board/db.ts'
import {
  findProject,
  findTicket,
  readBoard,
  readProjectBoard,
  readTicket,
  type TicketRef,
} from '../core/board/read.ts'
import {
  CommentBody,
  Description,
  DueOn,
  MAX_TICKET_LABELS,
  Prefix,
  PriorityName,
  ShortName,
  TicketKey,
  Title,
} from '../core/board/schema.ts'
import {
  createTicket,
  moveTicket,
  saveComment,
  updateTicket,
} from '../core/board/tickets.ts'
import { BOARD_TOOLS, type BoardTool } from '../core/mcp-launch.ts'
import type {
  ActionResult,
  ProjectBoard,
  TicketSummary,
} from '../core/types.ts'
import type { Tool, ToolResult } from './protocol.ts'

type Refused = { refused: string }

const LabelNames = z.array(ShortName).max(MAX_TICKET_LABELS)

function refuse(text: string): ToolResult {
  return { text, isError: true }
}

function answer(value: unknown): ToolResult {
  return { text: JSON.stringify(value, null, 2), isError: false }
}

function acted(result: ActionResult): ToolResult {
  return { text: result.message, isError: !result.ok }
}

// A tool without its name: the input is checked against the schema before the call sees it, and
// the same schema is what tools/list shows.
function tool<Input extends z.ZodType>(
  description: string,
  input: Input,
  call: (given: z.output<Input>) => ToolResult,
): Omit<Tool, 'name'> {
  return {
    description,
    // io: 'input', so a field with a default isn't listed as required.
    inputSchema: z.toJSONSchema(input, { io: 'input' }),
    call: (given) => {
      const parsed = input.safeParse(given)
      if (parsed.success) return call(parsed.data)
      const [issue] = parsed.error.issues
      return refuse(`${issue.path.join('.') || 'arguments'}: ${issue.message}`)
    },
  }
}

// An unarchived project's board, by its prefix.
function boardOf(prefix: string, board: BoardContext): ProjectBoard | Refused {
  const project = findProject(prefix, board)
  if (project === null) {
    return {
      refused: `There's no project with the prefix ${prefix}. board_list_projects lists them.`,
    }
  }
  if ('problem' in project) return { refused: project.problem }
  if (project.archived) {
    return { refused: `${prefix} is archived. Restore it on the board first.` }
  }
  const found = readProjectBoard(project.id, board)
  if (found === null) return { refused: `There's no project ${prefix}` }
  return 'problem' in found ? { refused: found.problem } : found
}

// The ticket a key names, and its project's board for the names of its columns and labels.
function ticketOf(
  key: string,
  board: BoardContext,
): { ticket: TicketRef; board: ProjectBoard } | Refused {
  const ticket = findTicket(key, board)
  if (ticket === null) return { refused: `There's no ticket ${key}` }
  if ('problem' in ticket) return { refused: ticket.problem }
  const found = readProjectBoard(ticket.project, board)
  if (found === null) return { refused: `There's no ticket ${key}` }
  return 'problem' in found
    ? { refused: found.problem }
    : { ticket, board: found }
}

function columnNamed(found: ProjectBoard, name: string): number | Refused {
  const wanted = name.toLowerCase()
  const column = found.columns.find(
    (each) => each.name.toLowerCase() === wanted,
  )
  if (column !== undefined) return column.id
  const names = found.columns.map((each) => each.name).join(', ')
  return {
    refused: `${found.project.prefix} has no column "${name}". Its columns: ${names}`,
  }
}

function labelsNamed(found: ProjectBoard, names: string[]): number[] | Refused {
  const ids: number[] = []
  for (const name of names) {
    const wanted = name.toLowerCase()
    const label = found.labels.find(
      (each) => each.name.toLowerCase() === wanted,
    )
    if (label === undefined) {
      const has = found.labels.map((each) => each.name).join(', ')
      return {
        refused: `${found.project.prefix} has no label "${name}". ${has === '' ? 'It has no labels yet.' : `Its labels: ${has}`}`,
      }
    }
    ids.push(label.id)
  }
  return ids
}

// A card as an agent reads it: names where the page's shape holds ids.
function card(ticket: TicketSummary) {
  return {
    key: ticket.key,
    title: ticket.title,
    priority: ticket.priority,
    dueOn: ticket.dueOn,
    overdue: ticket.overdue,
    labels: ticket.labels.map((label) => label.name),
    comments: ticket.commentCount,
  }
}

export function boardTools(board: BoardContext): Tool[] {
  const tools: Record<BoardTool, Omit<Tool, 'name'>> = {
    board_list_projects: tool(
      "List the ticket board's projects that aren't archived: each one's name, the prefix its tickets' ids start with, and how many tickets are on its board.",
      z.strictObject({}),
      () => {
        const overview = readBoard(board)
        if ('problem' in overview) return refuse(overview.problem)
        return answer(
          overview.projects
            .filter((project) => !project.archived)
            .map(({ name, prefix, tickets }) => ({ name, prefix, tickets })),
        )
      },
    ),
    board_list_tickets: tool(
      "List one project's board: its columns left to right, each with its tickets top first, and the labels the project can use. A ticket's description and comments come from board_get_ticket.",
      z.strictObject({ project: Prefix }),
      ({ project }) => {
        const found = boardOf(project, board)
        if ('refused' in found) return refuse(found.refused)
        return answer({
          project: { name: found.project.name, prefix: found.project.prefix },
          columns: found.columns.map((column) => ({
            name: column.name,
            tickets: column.tickets.map(card),
          })),
          labels: found.labels.map((label) => label.name),
        })
      },
    ),
    board_get_ticket: tool(
      'Read one ticket by its id (BEANS-3): its title, column, priority, due date, labels, markdown description and comments, oldest first.',
      z.strictObject({ key: TicketKey }),
      ({ key }) => {
        const found = ticketOf(key, board)
        if ('refused' in found) return refuse(found.refused)
        const detail = readTicket(
          found.ticket.project,
          found.ticket.number,
          board,
        )
        if (detail === null) return refuse(`There's no ticket ${key}`)
        if ('problem' in detail) return refuse(detail.problem)
        return answer({
          ...card(detail),
          column:
            found.board.columns.find((column) => column.id === detail.column)
              ?.name ?? null,
          archived: detail.archived,
          createdAt: detail.createdAt,
          description: detail.description,
          comments: detail.comments.map(({ body, createdAt, editedAt }) => ({
            body,
            createdAt,
            editedAt,
          })),
        })
      },
    ),
    board_create_ticket: tool(
      "Create a ticket in a project, named by its prefix. It lands at the top of the column named, or of the project's first column when none is. Labels are named, and must be ones the project already has. Answers the new ticket's id.",
      z.strictObject({
        project: Prefix,
        title: Title,
        description: Description.default(''),
        column: ShortName.optional(),
        priority: PriorityName.default('none'),
        dueOn: DueOn.default(null),
        labels: LabelNames.default([]),
      }),
      ({ project, column, labels, ...ticket }) => {
        const found = boardOf(project, board)
        if ('refused' in found) return refuse(found.refused)
        const into =
          column === undefined ? undefined : columnNamed(found, column)
        if (typeof into === 'object') return refuse(into.refused)
        const ids = labelsNamed(found, labels)
        if ('refused' in ids) return refuse(ids.refused)
        return acted(
          createTicket(
            { project: found.project.id, column: into, labels: ids, ...ticket },
            board,
          ),
        )
      },
    ),
    board_update_ticket: tool(
      "Change a ticket's title, description, priority, due date or labels. Only the fields named change; labels replace the ticket's whole set, and dueOn: null clears the date. It doesn't move the ticket: board_move_ticket does.",
      z.strictObject({
        key: TicketKey,
        title: Title.optional(),
        description: Description.optional(),
        priority: PriorityName.optional(),
        dueOn: DueOn.optional(),
        labels: LabelNames.optional(),
      }),
      ({ key, labels, ...changes }) => {
        if (
          labels === undefined &&
          Object.values(changes).every((value) => value === undefined)
        ) {
          return refuse(
            'Name a field to change: title, description, priority, dueOn or labels',
          )
        }
        const found = ticketOf(key, board)
        if ('refused' in found) return refuse(found.refused)
        const ids =
          labels === undefined ? undefined : labelsNamed(found.board, labels)
        if (ids !== undefined && 'refused' in ids) return refuse(ids.refused)
        return acted(
          updateTicket({ id: found.ticket.id, labels: ids, ...changes }, board),
        )
      },
    ),
    board_move_ticket: tool(
      "Move a ticket to another column of its project, named by the column's name (In progress). It lands at the top of that column.",
      z.strictObject({ key: TicketKey, column: ShortName }),
      ({ key, column }) => {
        const found = ticketOf(key, board)
        if ('refused' in found) return refuse(found.refused)
        const into = columnNamed(found.board, column)
        if (typeof into === 'object') return refuse(into.refused)
        return acted(
          moveTicket(
            {
              id: found.ticket.id,
              column: into,
              beside: null,
              place: 'before',
            },
            board,
          ),
        )
      },
    ),
    board_add_comment: tool(
      'Add a markdown comment to a ticket. Comments are kept in order and this adds one at the end; it never edits or removes one.',
      z.strictObject({ key: TicketKey, body: CommentBody }),
      ({ key, body }) => {
        const found = ticketOf(key, board)
        if ('refused' in found) return refuse(found.refused)
        const added = saveComment({ ticket: found.ticket.id, body }, board)
        return added.ok
          ? { text: `Commented on ${key}`, isError: false }
          : acted(added)
      },
    ),
  }
  return BOARD_TOOLS.map((name) => ({ name, ...tools[name] }))
}
