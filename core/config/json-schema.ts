// The config's JSON Schema, for editors: a stack-monitor.json whose $schema points at the
// committed file gets completion and hover docs. Refinements (needs that exist, {index} with an
// index) can't be said in JSON Schema, so only the monitor itself checks those.
import { join } from 'node:path'

import { z } from 'zod'

import { ConfigSchema } from './schema.ts'

export const SCHEMA_FILE = join(
  import.meta.dirname,
  '..',
  '..',
  'schema',
  'stack-monitor.schema.json',
)

// io: input, so a field with a default reads as optional, as it is in the file a user writes.
export function configJsonSchema(): string {
  const schema = z.toJSONSchema(ConfigSchema, { io: 'input' })
  return `${JSON.stringify(schema, null, 2)}\n`
}
