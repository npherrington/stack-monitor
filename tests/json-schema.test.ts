import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { configJsonSchema, SCHEMA_FILE } from '../core/config/json-schema.ts'

test('the committed JSON Schema is what the zod schema gives (mise run schema writes it)', () => {
  assert.equal(readFileSync(SCHEMA_FILE, 'utf8'), configJsonSchema())
})
