const MAX_CHARS = 60

// beans-3-add-a-dark-theme: the ticket's key and its title's words, in what a branch name takes.
// A title with no letters or digits leaves the key alone.
export function ticketBranch(key: string, title: string): string {
  let branch = key.toLowerCase()
  for (const word of title.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (branch.length + 1 + word.length > MAX_CHARS) break
    branch += `-${word}`
  }
  return branch
}
