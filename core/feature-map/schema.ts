// What a stack map file and a repo's blocks file hold, and the rules the save form shares with the
// routes. Imports nothing from Node, so the page imports it too.
import { z } from 'zod'

import { Name, RepoPath } from '../config/schema.ts'
import { BLOCK_KINDS, type Block, type StackMap } from '../types.ts'

export const MAX_NODES = 200
export const MAX_EDGES = 400
// Compact JSON, as the page sends it: under the server's 64 KB body cap with room for root and name.
export const MAX_MAP_BYTES = 60 * 1024
export const MAX_MAP_NAME = 60

export const MapTitle = z
  .string()
  .trim()
  .min(1, 'Give it a title')
  .max(120)
  .regex(/^[^\r\n]*$/, 'Keep the title to one line')

export const MapName = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9-]{0,59}$/,
    'Use up to 60 lowercase letters, digits and -, starting with a letter or digit',
  )

// The file a title saves to unless another name is typed: "Guest checkout" becomes guest-checkout.
// A title with no Latin letters or digits gives ''.
export function mapName(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, MAX_MAP_NAME)
    .replace(/-+$/, '')
}

const ElementId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)
const Text = z.string().max(80)
const Coordinate = z.number().min(-1e6).max(1e6)

export const StackMapSchema = z
  .strictObject({
    version: z.literal(1),
    title: MapTitle,
    starter: z.boolean().default(false),
    nodes: z
      .array(
        z.strictObject({
          id: ElementId,
          block: Name,
          label: Text,
          note: z.string().max(1000).optional(),
          x: Coordinate,
          y: Coordinate,
        }),
      )
      .max(MAX_NODES),
    edges: z
      .array(
        z.strictObject({
          id: ElementId,
          from: ElementId,
          to: ElementId,
          label: Text.optional(),
        }),
      )
      .max(MAX_EDGES),
  })
  .superRefine((map, ctx) => {
    const nodes = new Set<string>()
    map.nodes.forEach((node, index) => {
      if (nodes.has(node.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes', index, 'id'],
          message: `Two blocks share the id ${node.id}`,
        })
      }
      nodes.add(node.id)
    })
    const edges = new Set<string>()
    map.edges.forEach((edge, index) => {
      if (edges.has(edge.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['edges', index, 'id'],
          message: `Two arrows share the id ${edge.id}`,
        })
      }
      edges.add(edge.id)
      for (const end of ['from', 'to'] as const) {
        if (!nodes.has(edge[end])) {
          ctx.addIssue({
            code: 'custom',
            path: ['edges', index, end],
            message: `The arrow ${edge.id} ends at ${edge[end]}, which isn't a block on this map`,
          })
        }
      }
    })
    const bytes = new TextEncoder().encode(JSON.stringify(map)).length
    if (bytes > MAX_MAP_BYTES) {
      ctx.addIssue({
        code: 'custom',
        message: `This map is ${Math.ceil(bytes / 1024)} KB; a map holds up to ${MAX_MAP_BYTES / 1024} KB. Shorten its notes, or split it in two.`,
      })
    }
  }) satisfies z.ZodType<StackMap>

export const BlockSchema = z.strictObject({
  id: Name,
  name: z.string().trim().min(1).max(40),
  kind: z.enum(BLOCK_KINDS),
  paths: z.array(RepoPath).max(20).default([]),
  docs: z.array(RepoPath).max(20).default([]),
}) satisfies z.ZodType<Block>

// featureMap.blocks: { "version": 1, "blocks": [...] }, no two with one id.
export const BlocksFileSchema = z
  .strictObject({
    version: z.literal(1),
    blocks: z.array(BlockSchema).max(100),
  })
  .superRefine((file, ctx) => {
    const ids = new Set<string>()
    file.blocks.forEach((block, index) => {
      if (ids.has(block.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', index, 'id'],
          message: `Two blocks share the id ${block.id}`,
        })
      }
      ids.add(block.id)
    })
  })
