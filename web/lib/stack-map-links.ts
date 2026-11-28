import { MapName } from '../../core/feature-map/schema.ts'

// Where the Stack map shows a repo, or one of its saved maps: the repo's root and the map's file
// name ride in the hash's query, so a link opens the same map.
export function stackMapPath(root: string, name?: string): string {
  const path = `/stack-map?repo=${encodeURIComponent(root)}`
  return name === undefined ? path : `${path}&map=${encodeURIComponent(name)}`
}

// The map query value, when it's a name a map file can have.
export function readMapName(value: string | null): string | null {
  return value !== null && MapName.safeParse(value).success ? value : null
}
