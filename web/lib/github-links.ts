// Where the GitHub tab shows a repo, or one of its PRs: the repo's root and the PR's number ride in
// the hash's query, so a checkout row can link straight to its branch's PR.
export function repoPath(root: string): string {
  return `/github?repo=${encodeURIComponent(root)}`
}

export type PullTab = 'conversation' | 'files'

export function pullPath(
  root: string,
  number: number,
  tab: PullTab = 'conversation',
): string {
  const path = `${repoPath(root)}&pr=${number}`
  return tab === 'files' ? `${path}&tab=files` : path
}

export function readPullTab(value: string | null): PullTab {
  return value === 'files' ? 'files' : 'conversation'
}

// The pr query value, when it's a PR number.
export function readPullNumber(value: string | null): number | null {
  if (value === null || !/^[1-9]\d{0,9}$/.test(value)) return null
  return Number(value)
}
