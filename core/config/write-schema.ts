// `mise run schema`: writes the committed JSON Schema from the zod schema.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { configJsonSchema, SCHEMA_FILE } from './json-schema.ts'

mkdirSync(dirname(SCHEMA_FILE), { recursive: true })
writeFileSync(SCHEMA_FILE, configJsonSchema())
console.warn(`Wrote ${SCHEMA_FILE}`)
