import { z } from 'zod'

import type { ServiceInput, StackInput } from '../../core/config/schema.ts'

// The Stack editor's form: one flat row per service, turned into the config's shape on save. The
// server validates the result against the whole config schema (needs loops, {index} rules).

export const STATUS_KINDS = ['port', 'compose', 'process', 'command'] as const
export type StatusKind = (typeof STATUS_KINDS)[number]

const NAME = /^[a-z][a-z0-9-]{0,23}$/

const serviceRowSchema = z
  .object({
    name: z
      .string()
      .regex(NAME, 'Lowercase letters, digits and -, starting with a letter'),
    start: z.string().trim().min(1, 'The command that starts it'),
    stop: z.string(),
    kind: z.enum(STATUS_KINDS),
    portBase: z.string(),
    portFile: z.string(),
    portKey: z.string(),
    composeProject: z.string(),
    composeParts: z.string(),
    processMatch: z.string(),
    processOwner: z.enum(['cwd', 'argument']),
    command: z.string(),
    oneShot: z.boolean(),
    ready: z.string(),
    needs: z.array(z.string()),
  })
  .superRefine((row, ctx) => {
    const need = (ok: boolean, path: string, message: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [path], message })
    }
    if (row.kind === 'port') {
      const hasFile = row.portFile.trim() !== '' || row.portKey.trim() !== ''
      need(
        row.portBase.trim() !== '' || hasFile,
        'portBase',
        'A port, or the env file and key that hold it',
      )
      if (row.portBase.trim() !== '') {
        const port = Number(row.portBase)
        need(
          Number.isInteger(port) && port >= 1 && port <= 65535,
          'portBase',
          'A port from 1 to 65535',
        )
      }
      if (hasFile) {
        need(row.portFile.trim() !== '', 'portFile', 'The env file')
        need(row.portKey.trim() !== '', 'portKey', 'The key in it')
      }
    }
    if (row.kind === 'compose') {
      need(
        row.composeParts.trim() !== '',
        'composeParts',
        'The compose services it runs, separated by commas',
      )
    }
    if (row.kind === 'process') {
      need(
        row.processMatch.trim() !== '',
        'processMatch',
        'Text its command line contains',
      )
    }
    if (row.kind === 'command') {
      need(
        row.command.trim() !== '',
        'command',
        'A command that exits 0 when up',
      )
    }
    need(
      !(row.oneShot && row.ready.trim() !== ''),
      'ready',
      'A one-shot command says it’s up by exiting',
    )
  })

export const stackFormSchema = z
  .object({ services: z.array(serviceRowSchema) })
  .superRefine(({ services }, ctx) => {
    const seen = new Set<string>()
    services.forEach((row, at) => {
      if (seen.has(row.name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['services', at, 'name'],
          message: 'Another service has this name',
        })
      }
      seen.add(row.name)
    })
  })

export type ServiceRow = z.infer<typeof serviceRowSchema>
export type StackFormValues = z.infer<typeof stackFormSchema>

export function blankRow(name = ''): ServiceRow {
  return {
    name,
    start: '',
    stop: '',
    kind: 'port',
    portBase: '',
    portFile: '',
    portKey: '',
    composeProject: '',
    composeParts: '',
    processMatch: '',
    processOwner: 'cwd',
    command: '',
    oneShot: false,
    ready: '',
    needs: [],
  }
}

export function rowFromService(
  name: string,
  service: ServiceInput,
): ServiceRow {
  const { status } = service
  const kind: StatusKind =
    status.compose !== undefined
      ? 'compose'
      : status.process !== undefined
        ? 'process'
        : status.command !== undefined
          ? 'command'
          : 'port'
  return {
    ...blankRow(name),
    start: service.start,
    stop: service.stop ?? '',
    kind,
    portBase: status.port?.base?.toString() ?? '',
    portFile: status.port?.file ?? '',
    portKey: status.port?.key ?? '',
    composeProject: status.compose?.project ?? '',
    composeParts: status.compose?.parts.join(', ') ?? '',
    processMatch: status.process?.match ?? '',
    processOwner: status.process?.owner ?? 'cwd',
    command: status.command ?? '',
    oneShot: service.oneShot ?? false,
    ready: service.ready ?? '',
    needs: service.needs ?? [],
  }
}

function optional(text: string): string | undefined {
  const trimmed = text.trim()
  return trimmed === '' ? undefined : trimmed
}

function statusOf(row: ServiceRow): ServiceInput['status'] {
  switch (row.kind) {
    case 'port':
      return {
        port: {
          base:
            optional(row.portBase) === undefined
              ? undefined
              : Number(row.portBase),
          file: optional(row.portFile),
          key: optional(row.portKey),
        },
      }
    case 'compose':
      return {
        compose: {
          project: optional(row.composeProject),
          parts: row.composeParts
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean),
        },
      }
    case 'process':
      return {
        process: { match: row.processMatch.trim(), owner: row.processOwner },
      }
    case 'command':
      return { command: row.command.trim() }
  }
}

// The rows as the config's stack. What the editor doesn't show (startAll, shared) comes from the
// stack as loaded, with names that are gone taken out of startAll.
export function stackFromRows(
  rows: ServiceRow[],
  loaded: StackInput | null,
): StackInput {
  const names = new Set(rows.map((row) => row.name))
  const services: Record<string, ServiceInput> = {}
  for (const row of rows) {
    services[row.name] = {
      start: row.start.trim(),
      stop: optional(row.stop),
      status: statusOf(row),
      oneShot: row.oneShot || undefined,
      needs: row.needs.filter((need) => names.has(need) && need !== row.name),
      ready: optional(row.ready),
    }
  }
  const startAll = loaded?.startAll?.filter((name) => names.has(name))
  return {
    ...loaded,
    services,
    startAll:
      startAll === undefined || startAll.length === 0 ? undefined : startAll,
  }
}
