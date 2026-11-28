import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import {
  BUILT_IN_BLOCKS,
  BUILT_IN_STARTERS,
} from '../core/feature-map/built-ins.ts'
import {
  deleteStackMap,
  readFeatureMap,
  readStackMap,
  saveStackMap,
  type FeatureMapRepo,
} from '../core/feature-map/maps.ts'
import {
  mapName,
  MAX_MAP_BYTES,
  StackMapSchema,
} from '../core/feature-map/schema.ts'
import type { StackMap } from '../core/types.ts'
import { tempDir, writeJson } from './fixtures.ts'

const MAPS = 'docs/stack-map/maps'

function repoAt(
  root: string,
  blocks: string | undefined = undefined,
): FeatureMapRepo {
  return { root, maps: MAPS, blocks }
}

function map(title: string, starter = false): StackMap {
  return {
    version: 1,
    title,
    starter,
    nodes: [
      { id: 'n1', block: 'web-app', label: 'Page', x: 0, y: 0 },
      {
        id: 'n2',
        block: 'api-route',
        label: '',
        note: 'POST /x',
        x: 240,
        y: 0,
      },
    ],
    edges: [{ id: 'e1', from: 'n1', to: 'n2', label: 'calls' }],
  }
}

describe('the stack map file format', () => {
  test('a map is refused for a node id used twice, an arrow to a node it has not, and a size over 60 KB', () => {
    const doubled = map('Doubled')
    doubled.nodes[1].id = 'n1'
    doubled.edges = []
    const dangling = map('Dangling')
    dangling.edges[0].to = 'n9'
    const huge = map('Huge')
    huge.nodes[0].note = 'x'.repeat(1000)
    huge.nodes = Array.from({ length: 70 }, (_, index) => ({
      ...huge.nodes[0],
      id: `n${index}`,
    }))
    huge.edges = []
    assert.ok(JSON.stringify(huge).length > MAX_MAP_BYTES)

    const issues = (value: StackMap) => {
      const parsed = StackMapSchema.safeParse(value)
      return parsed.success
        ? []
        : parsed.error.issues.map((issue) => [
            issue.path.join('.'),
            issue.message,
          ])
    }
    assert.deepEqual(issues(doubled), [
      ['nodes.1.id', 'Two blocks share the id n1'],
    ])
    assert.deepEqual(issues(dangling), [
      [
        'edges.0.to',
        "The arrow e1 ends at n9, which isn't a block on this map",
      ],
    ])
    const [[path, message]] = issues(huge)
    assert.equal(path, '')
    assert.match(
      message,
      /^This map is \d+ KB; a map holds up to 60 KB\. Shorten its notes, or split it in two\.$/,
    )
  })

  test('a title becomes a file name', () => {
    for (const [title, name] of [
      ['Guest checkout', 'guest-checkout'],
      ['Café: v2!', 'cafe-v2'],
      ['a'.repeat(59) + ' b', 'a'.repeat(59)],
      ['お知らせ', ''],
    ]) {
      assert.equal(mapName(title), name, title)
    }
  })
})

describe('a repo’s maps and blocks', () => {
  test('a repo block replaces the built-in with its id and its new ones follow; a blocks file that does not parse is a problem and the built-ins stay', () => {
    const root = tempDir()
    writeJson(join(root, 'blocks.json'), {
      version: 1,
      blocks: [
        { id: 'billing', name: 'Billing service', kind: 'external' },
        { id: 'database', name: 'Postgres', kind: 'data', paths: ['db/'] },
      ],
    })
    const overview = readFeatureMap(repoAt(root, 'blocks.json'))
    assert.deepEqual(
      overview.blocks.map((block) => block.id),
      [...BUILT_IN_BLOCKS.map((block) => block.id), 'billing'],
    )
    const database = overview.blocks.find((block) => block.id === 'database')
    assert.deepEqual(database, {
      id: 'database',
      name: 'Postgres',
      kind: 'data',
      paths: ['db/'],
      docs: [],
      source: 'repo',
    })
    assert.equal(
      overview.blocks.find((block) => block.id === 'web-app')?.source,
      'built-in',
    )
    assert.deepEqual(overview.problems, [])

    const offered = new Set(overview.blocks.map((block) => block.id))
    for (const starter of BUILT_IN_STARTERS) {
      assert.equal(StackMapSchema.safeParse(starter.map).success, true)
      for (const node of starter.map.nodes) assert.ok(offered.has(node.block))
    }

    writeFileSync(join(root, 'blocks.json'), '{ nope')
    const broken = readFeatureMap(repoAt(root, 'blocks.json'))
    assert.deepEqual(
      broken.blocks.map((block) => block.id),
      BUILT_IN_BLOCKS.map((block) => block.id),
    )
    assert.equal(broken.problems.length, 1)
    assert.equal(broken.problems[0].file, 'blocks.json')
    assert.match(broken.problems[0].problem, /^isn't readable JSON/)

    writeJson(join(root, 'blocks.json'), {
      version: 1,
      blocks: [
        { id: 'a', name: 'A', kind: 'data' },
        { id: 'a', name: 'B', kind: 'data' },
      ],
    })
    assert.match(
      readFeatureMap(repoAt(root, 'blocks.json')).problems[0].problem,
      /Two blocks share the id a/,
    )
  })

  test('saves, reads, lists, renames and deletes a map, listing a file that does not parse as a problem', async () => {
    const root = tempDir()
    const repo = repoAt(root)
    assert.deepEqual(readFeatureMap(repo).maps, [])
    assert.equal(readStackMap(repo, 'guest'), null)

    const saved = await saveStackMap(repo, 'guest', map('Guest'))
    assert.deepEqual(saved, {
      ok: true,
      message: `Saved ${MAPS}/guest.json`,
      log: null,
    })
    const dir = join(root, MAPS)
    assert.deepEqual(
      JSON.parse(readFileSync(join(dir, 'guest.json'), 'utf8')),
      map('Guest'),
    )
    assert.deepEqual(readStackMap(repo, 'guest'), map('Guest'))

    writeFileSync(join(dir, 'broken.json'), '{ nope')
    writeJson(join(dir, 'Notes.json'), map('Notes'))
    writeFileSync(join(dir, 'readme.txt'), 'ignored')
    const listed = readFeatureMap(repo)
    assert.deepEqual(listed.maps, [
      { name: 'guest', title: 'Guest', starter: false },
    ])
    assert.deepEqual(
      listed.problems.map(({ file }) => file),
      [`${MAPS}/Notes.json`, `${MAPS}/broken.json`],
    )
    assert.match(
      listed.problems[0].problem,
      /isn't a name a map can be opened by/,
    )
    assert.deepEqual(readStackMap(repo, 'broken'), {
      refused: `${MAPS}/broken.json ${listed.problems[1].problem}`,
    })

    const renamed = await saveStackMap(
      repo,
      'guest-v2',
      map('Guest v2'),
      'guest',
    )
    assert.equal(renamed.ok, true)
    assert.match(renamed.message, /renamed from guest\)$/)
    assert.equal(existsSync(join(dir, 'guest.json')), false)
    assert.equal(existsSync(join(dir, 'guest-v2.json')), true)

    await saveStackMap(repo, 'flow', map('Flow', true))
    const starters = readFeatureMap(repo).starters
    assert.deepEqual(
      starters.map((starter) => [starter.name, starter.source]),
      [
        ...BUILT_IN_STARTERS.map(({ name }) => [name, 'built-in']),
        ['flow', 'repo'],
      ],
    )

    const deleted = await deleteStackMap(repo, 'guest-v2')
    assert.deepEqual(deleted, {
      ok: true,
      message: `Deleted ${MAPS}/guest-v2.json`,
      log: null,
    })
    assert.equal(existsSync(join(dir, 'guest-v2.json')), false)
  })

  test('refuses a name taken, replacing one that is not there, a bad name, and deleting one that is not there', async () => {
    const root = tempDir()
    const repo = repoAt(root)
    await saveStackMap(repo, 'one', map('One'))
    await saveStackMap(repo, 'two', map('Two'))

    const taken = await saveStackMap(repo, 'two', map('Two again'))
    assert.equal(taken.ok, false)
    assert.match(taken.message, /A map named two already exists/)
    const onto = await saveStackMap(repo, 'two', map('Two again'), 'one')
    assert.match(onto.message, /A map named two already exists/)
    assert.equal(
      (await saveStackMap(repo, 'one', map('One v2'), 'one')).ok,
      true,
    )
    assert.deepEqual(readStackMap(repo, 'one'), map('One v2'))

    const gone = await saveStackMap(repo, 'three', map('Three'), 'nope')
    assert.equal(gone.message, "There's no map nope to replace")
    const outside = await saveStackMap(repo, '../escape', map('Escape'))
    assert.equal(outside.ok, false)
    assert.equal(
      existsSync(join(root, 'docs', 'stack-map', 'escape.json')),
      false,
    )
    const victim = join(root, 'docs', 'stack-map', 'victim.json')
    writeFileSync(victim, '{}')
    const stolen = await saveStackMap(repo, 'x', map('X'), '../victim')
    assert.equal(stolen.ok, false)
    assert.equal(existsSync(victim), true)
    assert.equal((await saveStackMap(repo, 'Upper', map('Upper'))).ok, false)

    const absent = await deleteStackMap(repo, 'nope')
    assert.deepEqual(absent, {
      ok: false,
      message: "There's no map nope",
      log: null,
    })
    const two = join(root, 'docs', 'stack-map', 'two.json')
    writeFileSync(two, '{}')
    assert.equal((await deleteStackMap(repo, '../two')).ok, false)
    assert.equal(existsSync(two), true)
  })
})
