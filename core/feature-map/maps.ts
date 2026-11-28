// A repo's stack maps: <featureMap.maps>/<name>.json in its primary checkout, and the blocks file
// featureMap.blocks names. Read on every request and written as plain files for the repo to
// commit, so the monitor keeps nothing.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import { describeIssues } from '../config/load.ts'
import { trackedRepo, type Unlisted } from '../config/sections.ts'
import { loadRepoConfig, oneAtATime, PathText } from '../repos.ts'
import { writeJsonFile, type Tracking } from '../settings.ts'
import {
  errorMessage,
  failure,
  type ActionResult,
  type Block,
  type BlockInfo,
  type FeatureMapOverview,
  type StackMap,
  type StackMapStarter,
  type StackMapSummary,
} from '../types.ts'
import { BUILT_IN_BLOCKS, BUILT_IN_STARTERS } from './built-ins.ts'
import { BlocksFileSchema, MapName, StackMapSchema } from './schema.ts'

export const StackMapQuery = z.object({ root: PathText, name: MapName })
export const SaveStackMapRequest = z.strictObject({
  root: PathText,
  name: MapName,
  map: StackMapSchema,
  replacing: MapName.optional(), // the name it's saved under now, when it was opened from a file
})
export const DeleteStackMapRequest = z.strictObject({
  root: PathText,
  name: MapName,
})

export interface FeatureMapRepo {
  root: string // the primary checkout
  maps: string // featureMap.maps
  blocks: string | undefined // featureMap.blocks
}

// The tracked repo and where its maps and blocks are, from its config as read now. A config that
// doesn't load refuses, rather than guessing a folder to write into.
export function featureMapRepo(
  tracking: Tracking,
  given: string,
): FeatureMapRepo | Unlisted {
  const repo = trackedRepo(tracking, given)
  if (!('root' in repo)) return repo
  const loaded = loadRepoConfig(tracking, repo.root)
  if (!loaded.ok) {
    return { refused: `${loaded.problem}. Fix it to use the stack map.` }
  }
  const { blocks, maps } = loaded.config.featureMap
  return { root: repo.root, maps, blocks }
}

function mapsDir(repo: FeatureMapRepo): string {
  return join(repo.root, repo.maps)
}

function fileOf(repo: FeatureMapRepo, name: string): string {
  return join(mapsDir(repo), `${name}.json`)
}

function readJson(path: string): { raw: unknown } | { problem: string } {
  try {
    return { raw: JSON.parse(readFileSync(path, 'utf8')) }
  } catch (error) {
    return { problem: `isn't readable JSON: ${errorMessage(error)}` }
  }
}

function readMapFile(
  repo: FeatureMapRepo,
  file: string,
): StackMap | { problem: string } {
  const stem = file.slice(0, -'.json'.length)
  if (!MapName.safeParse(stem).success) {
    return { problem: `${stem} isn't a name a map can be opened by` }
  }
  const read = readJson(join(mapsDir(repo), file))
  if ('problem' in read) return read
  const parsed = StackMapSchema.safeParse(read.raw)
  return parsed.success
    ? parsed.data
    : { problem: describeIssues(parsed.error.issues) }
}

// The built-ins in their order, the repo's replacing any it gives an id to, then its other blocks.
function mergeBlocks(repoBlocks: Block[]): BlockInfo[] {
  const own = new Map(repoBlocks.map((block) => [block.id, block]))
  const merged: BlockInfo[] = BUILT_IN_BLOCKS.map((builtIn) => {
    const replacement = own.get(builtIn.id)
    return replacement === undefined
      ? { ...builtIn, source: 'built-in' }
      : { ...replacement, source: 'repo' }
  })
  const builtInIds = new Set(BUILT_IN_BLOCKS.map((builtIn) => builtIn.id))
  for (const block of repoBlocks) {
    if (!builtInIds.has(block.id)) merged.push({ ...block, source: 'repo' })
  }
  return merged
}

function readRepoBlocks(
  repo: FeatureMapRepo,
  blocks: string,
): Block[] | { problem: string } {
  const read = readJson(join(repo.root, blocks))
  if ('problem' in read) return read
  const parsed = BlocksFileSchema.safeParse(read.raw)
  return parsed.success
    ? parsed.data.blocks
    : { problem: describeIssues(parsed.error.issues) }
}

export function readFeatureMap(repo: FeatureMapRepo): FeatureMapOverview {
  const problems: FeatureMapOverview['problems'] = []
  let repoBlocks: Block[] = []
  if (repo.blocks !== undefined) {
    const read = readRepoBlocks(repo, repo.blocks)
    if ('problem' in read) {
      problems.push({ file: repo.blocks, problem: read.problem })
    } else {
      repoBlocks = read
    }
  }

  let files: string[] = []
  try {
    files = readdirSync(mapsDir(repo)).filter((file) => file.endsWith('.json'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      problems.push({
        file: repo.maps,
        problem: `isn't readable: ${errorMessage(error)}`,
      })
    }
  }
  const maps: StackMapSummary[] = []
  const starters: StackMapStarter[] = BUILT_IN_STARTERS.map((starter) => ({
    ...starter,
    source: 'built-in',
  }))
  for (const file of files.toSorted()) {
    const read = readMapFile(repo, file)
    if ('problem' in read) {
      problems.push({ file: `${repo.maps}/${file}`, problem: read.problem })
      continue
    }
    const name = file.slice(0, -'.json'.length)
    maps.push({ name, title: read.title, starter: read.starter })
    if (read.starter) starters.push({ name, source: 'repo', map: read })
  }

  return {
    folder: repo.maps,
    blocks: mergeBlocks(repoBlocks),
    maps,
    starters,
    problems,
  }
}

// null when there's no such map; refused when its file doesn't parse.
export function readStackMap(
  repo: FeatureMapRepo,
  name: string,
): StackMap | Unlisted | null {
  if (!existsSync(fileOf(repo, name))) return null
  const read = readMapFile(repo, `${name}.json`)
  return 'problem' in read
    ? { refused: `${repo.maps}/${name}.json ${read.problem}` }
    : read
}

// A new name may not land on another map; replacing names the one being edited, which a rename
// removes once the new file is written.
export function saveStackMap(
  repo: FeatureMapRepo,
  name: string,
  map: StackMap,
  replacing?: string,
): Promise<ActionResult> {
  return oneAtATime(async () => {
    const parsed = StackMapSchema.safeParse(map)
    if (!parsed.success) return failure(describeIssues(parsed.error.issues))
    if (!MapName.safeParse(name).success) {
      return failure(`${name} isn't a name a map can be saved under`)
    }
    if (replacing !== undefined && !MapName.safeParse(replacing).success) {
      return failure(`${replacing} isn't a map name`)
    }
    if (replacing !== undefined && !existsSync(fileOf(repo, replacing))) {
      return failure(`There's no map ${replacing} to replace`)
    }
    if (name !== replacing && existsSync(fileOf(repo, name))) {
      return failure(`A map named ${name} already exists`)
    }
    try {
      writeJsonFile(fileOf(repo, name), parsed.data)
      if (replacing !== undefined && replacing !== name) {
        rmSync(fileOf(repo, replacing), { force: true })
      }
    } catch (error) {
      return failure(`Couldn't save ${name}: ${errorMessage(error)}`)
    }
    const renamed =
      replacing !== undefined && replacing !== name
        ? ` (renamed from ${replacing})`
        : ''
    return {
      ok: true,
      message: `Saved ${repo.maps}/${name}.json${renamed}`,
      log: null,
    }
  })
}

export function deleteStackMap(
  repo: FeatureMapRepo,
  name: string,
): Promise<ActionResult> {
  return oneAtATime(async () => {
    if (!MapName.safeParse(name).success) {
      return failure(`${name} isn't a map name`)
    }
    if (!existsSync(fileOf(repo, name)))
      return failure(`There's no map ${name}`)
    try {
      rmSync(fileOf(repo, name))
    } catch (error) {
      return failure(`Couldn't delete ${name}: ${errorMessage(error)}`)
    }
    return {
      ok: true,
      message: `Deleted ${repo.maps}/${name}.json`,
      log: null,
    }
  })
}
