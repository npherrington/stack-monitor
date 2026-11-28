// The blocks and starter maps the tool ships; a repo's featureMap.blocks file adds to or replaces
// the blocks, and its saved maps add starters.
import type { Block, BlockKind, StackMap } from '../types.ts'

function block(id: string, name: string, kind: BlockKind): Block {
  return { id, name, kind, paths: [], docs: [] }
}

export const BUILT_IN_BLOCKS: Block[] = [
  block('web-app', 'Web app', 'client'),
  block('api-route', 'API route', 'server'),
  block('module', 'Module', 'server'),
  block('background-job', 'Background job', 'server'),
  block('scheduler', 'Scheduler', 'server'),
  block('auth', 'Auth', 'server'),
  block('database', 'Database', 'data'),
  block('cache', 'Cache', 'data'),
  block('queue', 'Queue', 'data'),
  block('file-storage', 'File storage', 'data'),
  block('external-api', 'External API', 'external'),
  block('llm', 'LLM', 'external'),
  block('email', 'Email', 'external'),
]

// Left to right, this far apart.
const STEP = 240

function chain(
  title: string,
  steps: { block: string; label: string }[],
  arrows: string[],
): StackMap {
  return {
    version: 1,
    title,
    starter: true,
    nodes: steps.map((step, index) => ({
      id: `n${index + 1}`,
      block: step.block,
      label: step.label,
      x: index * STEP,
      y: 0,
    })),
    edges: arrows.map((label, index) => ({
      id: `e${index + 1}`,
      from: `n${index + 1}`,
      to: `n${index + 2}`,
      ...(label === '' ? {} : { label }),
    })),
  }
}

export const BUILT_IN_STARTERS: { name: string; map: StackMap }[] = [
  {
    name: 'new-endpoint',
    map: chain(
      'New endpoint',
      [
        { block: 'web-app', label: 'Page' },
        { block: 'api-route', label: '' },
        { block: 'module', label: 'Handler' },
        { block: 'database', label: '' },
      ],
      ['calls', '', 'reads and writes'],
    ),
  },
  {
    name: 'new-db-method',
    map: chain(
      'New DB method',
      [
        { block: 'api-route', label: '' },
        { block: 'module', label: 'Data-access module' },
        { block: 'database', label: '' },
      ],
      ['', ''],
    ),
  },
]
