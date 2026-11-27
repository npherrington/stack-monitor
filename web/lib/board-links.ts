// Where the ticket board shows a project, or one of its tickets: the project's id and the
// ticket's number ride in the hash's query. Neither changes when a prefix is renamed, so a link
// outlives BEANS-12 becoming BEAN-12.
export function boardPath(project: number, ticket?: number): string {
  const path = `/board?project=${project}`
  return ticket === undefined ? path : `${path}&ticket=${ticket}`
}

// A project or ticket query value, when it's an id.
export function readId(value: string | null): number | null {
  if (value === null || !/^[1-9]\d{0,9}$/.test(value)) return null
  return Number(value)
}
