// A tracked repo's open PRs, their diffs and review threads, and reviewing them, through `gh` as
// its login. Every read asks GitHub again; nothing is kept. A line comment goes into the viewer's
// pending review on GitHub, so a draft survives a reload and can be finished on github.com.
import { z } from 'zod'

import { trackedRepo } from '../config/sections.ts'
import { PathText } from '../repos.ts'
import { run } from '../run.ts'
import type { Tracking } from '../settings.ts'
import {
  failure,
  type ActionResult,
  type GithubStatus,
  type PullDetail,
  type PullFile,
  type PullList,
  type PullSummary,
  type ReviewThread,
  type TimelineItem,
} from '../types.ts'
import { parsePatch } from './patch.ts'

const GH_TIMEOUT_MS = 30_000

const PullNumber = z.coerce.number().int().positive()
const NodeId = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\w=-]+$/)
const Body = z.string().trim().min(1, 'Write something first').max(60_000)

export const PullListRequest = z.object({ root: PathText })
export const PullRequest = z.object({ root: PathText, number: PullNumber })
export const LineCommentRequest = z.strictObject({
  root: PathText,
  number: PullNumber,
  path: z.string().min(1).max(4096),
  line: z.number().int().positive(),
  side: z.enum(['LEFT', 'RIGHT']),
  body: Body,
})
export const ReplyRequest = z.strictObject({
  root: PathText,
  number: PullNumber,
  thread: NodeId,
  body: Body,
})
export const ResolveRequest = z.strictObject({
  root: PathText,
  thread: NodeId,
  resolved: z.boolean(),
})
export const DeleteCommentRequest = z.strictObject({
  root: PathText,
  comment: NodeId,
})
export const SubmitReviewRequest = z.strictObject({
  root: PathText,
  number: PullNumber,
  event: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']),
  body: z.string().trim().max(60_000).default(''),
})

type Gh = { ok: true; stdout: string } | { ok: false; problem: string }

// gh's own words, first line: "Could not resolve to a PullRequest", "HTTP 401: Bad credentials".
async function gh(root: string, args: string[]): Promise<Gh> {
  const result = await run('gh', args, { cwd: root, timeoutMs: GH_TIMEOUT_MS })
  if (result.code === 0) return { ok: true, stdout: result.stdout }
  if (/ENOENT/.test(result.stderr)) {
    return {
      ok: false,
      problem:
        "gh isn't installed. Install it (brew install gh), then run gh auth login.",
    }
  }
  const line = result.stderr
    .split('\n')
    .map((each) => each.replace(/^gh: /, '').trim())
    .find((each) => each !== '')
  return { ok: false, problem: line ?? `gh ${args[0]} failed` }
}

function parsed<T>(schema: z.ZodType<T>, stdout: string): T | null {
  try {
    const result = schema.safeParse(JSON.parse(stdout))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

// gh api graphql: strings go as -f (taken literally, never read from a file); numbers as -F.
async function graphql<T>(
  root: string,
  schema: z.ZodType<T>,
  query: string,
  strings: Record<string, string>,
  numbers: Record<string, number> = {},
): Promise<T | { problem: string }> {
  const args = ['api', 'graphql', '-f', `query=${query}`]
  for (const [key, value] of Object.entries(strings)) {
    args.push('-f', `${key}=${value}`)
  }
  for (const [key, value] of Object.entries(numbers)) {
    args.push('-F', `${key}=${value}`)
  }
  const answer = await gh(root, args)
  if (!answer.ok) return { problem: answer.problem }
  const data = parsed(z.object({ data: schema }), answer.stdout)
  return data === null
    ? { problem: "GitHub's answer wasn't the shape the monitor expects" }
    : data.data
}

const RepoView = z.object({ nameWithOwner: z.string(), url: z.string() })

async function readStatusAt(root: string): Promise<GithubStatus> {
  const [repo, user] = await Promise.all([
    gh(root, ['repo', 'view', '--json', 'nameWithOwner,url']),
    gh(root, ['api', 'user', '--jq', '.login']),
  ])
  if (!user.ok) return { ok: false, problem: user.problem }
  if (!repo.ok) return { ok: false, problem: repo.problem }
  const view = parsed(RepoView, repo.stdout)
  if (view === null) {
    return { ok: false, problem: "gh repo view didn't answer a repo" }
  }
  return {
    ok: true,
    repo: view.nameWithOwner,
    url: view.url,
    viewer: user.stdout.trim(),
  }
}

type Repo = { root: string } & Extract<GithubStatus, { ok: true }>

async function githubRepo(
  tracking: Tracking,
  given: string,
): Promise<Repo | { problem: string } | { refused: string }> {
  const repo = trackedRepo(tracking, given)
  if (!('root' in repo)) return repo
  const status = await readStatusAt(repo.root)
  return status.ok
    ? { root: repo.root, ...status }
    : { refused: status.problem }
}

const Author = z.object({ login: z.string() }).nullable()
const login = (author: z.infer<typeof Author>) => author?.login ?? 'ghost'

const Decision = z
  .enum(['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED'])
  .or(z.literal(''))
  .nullable()
  .transform((value) => (value === '' ? null : value))

const GhLabel = z.object({ name: z.string(), color: z.string() })

const SUMMARY_FIELDS =
  'number,title,author,headRefName,baseRefName,isCrossRepository,isDraft,url,reviewDecision,labels,updatedAt,additions,deletions,changedFiles'

const GhPull = z.object({
  number: z.number(),
  title: z.string(),
  author: Author,
  headRefName: z.string(),
  baseRefName: z.string(),
  isCrossRepository: z.boolean(),
  isDraft: z.boolean(),
  url: z.string(),
  reviewDecision: Decision,
  labels: z.array(GhLabel).or(z.object({ nodes: z.array(GhLabel) })),
  updatedAt: z.string(),
  additions: z.number(),
  deletions: z.number(),
  changedFiles: z.number(),
})

function summary(pull: z.infer<typeof GhPull>): PullSummary {
  return {
    number: pull.number,
    title: pull.title,
    author: login(pull.author),
    branch: pull.headRefName,
    base: pull.baseRefName,
    crossRepository: pull.isCrossRepository,
    draft: pull.isDraft,
    url: pull.url,
    reviewDecision: pull.reviewDecision,
    labels: ('nodes' in pull.labels ? pull.labels.nodes : pull.labels).map(
      ({ name, color }) => ({
        name,
        // It ends up in a style on the page, so only a plain colour gets through.
        color: /^[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null,
      }),
    ),
    updatedAt: pull.updatedAt,
    additions: pull.additions,
    deletions: pull.deletions,
    changedFiles: pull.changedFiles,
  }
}

export async function listPulls(
  tracking: Tracking,
  given: string,
): Promise<PullList | { problem: string } | { refused: string }> {
  const repo = await githubRepo(tracking, given)
  if (!('root' in repo)) return repo
  const answer = await gh(repo.root, [
    'pr',
    'list',
    '--state',
    'open',
    '--limit',
    '200',
    '--json',
    SUMMARY_FIELDS,
  ])
  if (!answer.ok) return { refused: answer.problem }
  const pulls = parsed(z.array(GhPull), answer.stdout)
  if (pulls === null) return { problem: "gh pr list didn't answer a list" }
  return {
    repo: repo.repo,
    viewer: repo.viewer,
    pulls: pulls
      .map(summary)
      .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  }
}

const GhFile = z.object({
  filename: z.string(),
  previous_filename: z.string().optional(),
  status: z.string(),
  additions: z.number(),
  deletions: z.number(),
  patch: z.string().optional(),
})

// One object per line: --paginate with --jq '.[]' flattens the pages.
async function readFiles(
  repo: Repo,
  number: number,
): Promise<PullFile[] | { problem: string }> {
  const answer = await gh(repo.root, [
    'api',
    '--paginate',
    `repos/${repo.repo}/pulls/${number}/files?per_page=100`,
    '--jq',
    '.[]',
  ])
  if (!answer.ok) return { problem: answer.problem }
  const files: PullFile[] = []
  for (const line of answer.stdout.split('\n')) {
    if (line.trim() === '') continue
    const file = parsed(GhFile, line)
    if (file === null) return { problem: "GitHub's file list didn't parse" }
    files.push({
      path: file.filename,
      previousPath: file.previous_filename ?? null,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      hunks: file.patch === undefined ? null : parsePatch(file.patch),
    })
  }
  return files
}

const DETAIL_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id number title body url isDraft isCrossRepository updatedAt reviewDecision
      additions deletions changedFiles headRefName baseRefName
      author { login }
      labels(first: 20) { nodes { name color } }
      reviews(states: PENDING, first: 1) { nodes { id comments { totalCount } } }
      submitted: reviews(states: [APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED], last: 100) {
        nodes { id state body submittedAt url author { login } }
      }
      comments(last: 100) { nodes { id body createdAt url author { login } } }
      commits(last: 100) {
        nodes {
          commit {
            oid messageHeadline committedDate url
            author { name user { login } }
          }
        }
      }
      reviewThreads(first: 100) {
        nodes {
          id path line diffSide isResolved isOutdated
          comments(first: 100) {
            nodes { id body createdAt url state viewerDidAuthor author { login } }
          }
        }
      }
    }
  }
}`

const GhDetail = z.object({
  repository: z.object({
    pullRequest: GhPull.extend({
      id: z.string(),
      body: z.string(),
      submitted: z.object({
        nodes: z.array(
          z.object({
            id: z.string(),
            state: z.enum([
              'APPROVED',
              'CHANGES_REQUESTED',
              'COMMENTED',
              'DISMISSED',
            ]),
            body: z.string(),
            submittedAt: z.string().nullable(),
            url: z.string(),
            author: Author,
          }),
        ),
      }),
      comments: z.object({
        nodes: z.array(
          z.object({
            id: z.string(),
            body: z.string(),
            createdAt: z.string(),
            url: z.string(),
            author: Author,
          }),
        ),
      }),
      commits: z.object({
        nodes: z.array(
          z.object({
            commit: z.object({
              oid: z.string(),
              messageHeadline: z.string(),
              committedDate: z.string(),
              url: z.string(),
              author: z
                .object({ name: z.string().nullable(), user: Author })
                .nullable(),
            }),
          }),
        ),
      }),
      reviews: z.object({
        nodes: z.array(
          z.object({
            id: z.string(),
            comments: z.object({ totalCount: z.number() }),
          }),
        ),
      }),
      reviewThreads: z.object({
        nodes: z.array(
          z.object({
            id: z.string(),
            path: z.string(),
            line: z.number().nullable(),
            diffSide: z.enum(['LEFT', 'RIGHT']),
            isResolved: z.boolean(),
            isOutdated: z.boolean(),
            comments: z.object({
              nodes: z.array(
                z.object({
                  id: z.string(),
                  body: z.string(),
                  createdAt: z.string(),
                  url: z.string(),
                  state: z.string(),
                  viewerDidAuthor: z.boolean(),
                  author: Author,
                }),
              ),
            }),
          }),
        ),
      }),
    }),
  }),
})

function ownerName(repo: Repo): { owner: string; name: string } {
  const [owner, name] = repo.repo.split('/')
  return { owner, name }
}

export async function readPull(
  tracking: Tracking,
  given: string,
  number: number,
): Promise<PullDetail | { problem: string } | { refused: string }> {
  const repo = await githubRepo(tracking, given)
  if (!('root' in repo)) return repo
  const [detail, files] = await Promise.all([
    graphql(repo.root, GhDetail, DETAIL_QUERY, ownerName(repo), { number }),
    readFiles(repo, number),
  ])
  if ('problem' in detail) return { refused: detail.problem }
  if ('problem' in files) return { refused: files.problem }
  const pull = detail.repository.pullRequest
  const threads: ReviewThread[] = pull.reviewThreads.nodes.map((thread) => ({
    id: thread.id,
    path: thread.path,
    line: thread.line,
    side: thread.diffSide,
    resolved: thread.isResolved,
    outdated: thread.isOutdated,
    comments: thread.comments.nodes.map((comment) => ({
      id: comment.id,
      author: login(comment.author),
      body: comment.body,
      createdAt: comment.createdAt,
      url: comment.url,
      pending: comment.state === 'PENDING',
      mine: comment.viewerDidAuthor,
    })),
  }))
  const [pending] = pull.reviews.nodes
  const timeline: TimelineItem[] = [
    ...pull.comments.nodes.map((comment): TimelineItem => ({
      kind: 'comment',
      id: comment.id,
      author: login(comment.author),
      body: comment.body,
      at: comment.createdAt,
      url: comment.url,
    })),
    ...pull.commits.nodes.map(({ commit }): TimelineItem => ({
      kind: 'commit',
      id: commit.oid,
      author: commit.author?.user?.login ?? commit.author?.name ?? 'unknown',
      headline: commit.messageHeadline,
      at: commit.committedDate,
      url: commit.url,
    })),
    ...pull.submitted.nodes.map((review): TimelineItem => ({
      kind: 'review',
      id: review.id,
      author: login(review.author),
      state: review.state,
      body: review.body,
      at: review.submittedAt ?? '',
      url: review.url,
    })),
  ].toSorted((a, b) => a.at.localeCompare(b.at))
  return {
    ...summary(pull),
    body: pull.body,
    viewer: repo.viewer,
    files,
    threads,
    timeline,
    pendingReview: pending?.id ?? null,
    pendingComments: pending?.comments.totalCount ?? 0,
  }
}

const REVIEW_TARGET_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id
      reviews(states: PENDING, first: 1) { nodes { id } }
    }
  }
}`

const GhReviewTarget = z.object({
  repository: z.object({
    pullRequest: z.object({
      id: z.string(),
      reviews: z.object({ nodes: z.array(z.object({ id: z.string() })) }),
    }),
  }),
})

// The PR's node id, and the viewer's pending review on it, as GitHub has them now.
async function reviewTarget(
  repo: Repo,
  number: number,
): Promise<{ pull: string; pending: string | null } | { problem: string }> {
  const target = await graphql(
    repo.root,
    GhReviewTarget,
    REVIEW_TARGET_QUERY,
    ownerName(repo),
    { number },
  )
  if ('problem' in target) return target
  const { id, reviews } = target.repository.pullRequest
  return { pull: id, pending: reviews.nodes[0]?.id ?? null }
}

const Anything = z.unknown()

async function action(
  tracking: Tracking,
  given: string,
  act: (repo: Repo) => Promise<ActionResult>,
): Promise<ActionResult> {
  const repo = await githubRepo(tracking, given)
  if ('problem' in repo) return failure(repo.problem)
  if ('refused' in repo) return failure(repo.refused)
  return act(repo)
}

function done(answer: unknown, message: string, tried: string): ActionResult {
  if (typeof answer === 'object' && answer !== null && 'problem' in answer) {
    return failure(`${tried}: ${String(answer.problem)}`)
  }
  return { ok: true, message, log: null }
}

const START_REVIEW = `mutation($pull: ID!) {
  addPullRequestReview(input: { pullRequestId: $pull }) { pullRequestReview { id } }
}`

const GhStarted = z.object({
  addPullRequestReview: z.object({
    pullRequestReview: z.object({ id: z.string() }),
  }),
})

const ADD_THREAD = `mutation($review: ID!, $path: String!, $body: String!, $side: DiffSide!, $line: Int!) {
  addPullRequestReviewThread(input: {
    pullRequestReviewId: $review, path: $path, body: $body, side: $side, line: $line
  }) { thread { id } }
}`

export function addLineComment(
  tracking: Tracking,
  request: z.output<typeof LineCommentRequest>,
): Promise<ActionResult> {
  return action(tracking, request.root, async (repo) => {
    const target = await reviewTarget(repo, request.number)
    if ('problem' in target) {
      return failure(`Couldn't reach #${request.number}: ${target.problem}`)
    }
    let review = target.pending
    if (review === null) {
      const started = await graphql(repo.root, GhStarted, START_REVIEW, {
        pull: target.pull,
      })
      if ('problem' in started) {
        return failure(`Couldn't start a review: ${started.problem}`)
      }
      review = started.addPullRequestReview.pullRequestReview.id
    }
    const added = await graphql(
      repo.root,
      Anything,
      ADD_THREAD,
      { review, path: request.path, body: request.body, side: request.side },
      { line: request.line },
    )
    return done(
      added,
      `Added to your pending review on ${request.path}:${request.line}`,
      "Couldn't add the comment",
    )
  })
}

const REPLY = `mutation($thread: ID!, $body: String!, $review: ID) {
  addPullRequestReviewThreadReply(input: {
    pullRequestReviewThreadId: $thread, body: $body, pullRequestReviewId: $review
  }) { comment { id } }
}`

// With a pending review open, the reply joins it (GitHub keeps one draft per person per PR);
// without one it posts straight away.
export function replyToThread(
  tracking: Tracking,
  request: z.output<typeof ReplyRequest>,
): Promise<ActionResult> {
  return action(tracking, request.root, async (repo) => {
    const target = await reviewTarget(repo, request.number)
    if ('problem' in target) {
      return failure(`Couldn't reach #${request.number}: ${target.problem}`)
    }
    const strings: Record<string, string> = {
      thread: request.thread,
      body: request.body,
    }
    if (target.pending !== null) strings.review = target.pending
    const replied = await graphql(repo.root, Anything, REPLY, strings)
    return done(
      replied,
      target.pending === null
        ? 'Reply posted'
        : 'Reply added to your pending review',
      "Couldn't reply",
    )
  })
}

const RESOLVE = `mutation($thread: ID!) {
  resolveReviewThread(input: { threadId: $thread }) { thread { id } }
}`
const UNRESOLVE = `mutation($thread: ID!) {
  unresolveReviewThread(input: { threadId: $thread }) { thread { id } }
}`

export function resolveThread(
  tracking: Tracking,
  request: z.output<typeof ResolveRequest>,
): Promise<ActionResult> {
  return action(tracking, request.root, async (repo) => {
    const answer = await graphql(
      repo.root,
      Anything,
      request.resolved ? RESOLVE : UNRESOLVE,
      { thread: request.thread },
    )
    return done(
      answer,
      request.resolved ? 'Thread resolved' : 'Thread reopened',
      request.resolved
        ? "Couldn't resolve the thread"
        : "Couldn't reopen the thread",
    )
  })
}

const DELETE_COMMENT = `mutation($comment: ID!) {
  deletePullRequestReviewComment(input: { id: $comment }) { clientMutationId }
}`

export function deletePendingComment(
  tracking: Tracking,
  request: z.output<typeof DeleteCommentRequest>,
): Promise<ActionResult> {
  return action(tracking, request.root, async (repo) => {
    const answer = await graphql(repo.root, Anything, DELETE_COMMENT, {
      comment: request.comment,
    })
    return done(answer, 'Comment deleted', "Couldn't delete the comment")
  })
}

const SUBMIT_PENDING = `mutation($review: ID!, $event: PullRequestReviewEvent!, $body: String!) {
  submitPullRequestReview(input: { pullRequestReviewId: $review, event: $event, body: $body }) {
    pullRequestReview { id }
  }
}`
const SUBMIT_NEW = `mutation($pull: ID!, $event: PullRequestReviewEvent!, $body: String!) {
  addPullRequestReview(input: { pullRequestId: $pull, event: $event, body: $body }) {
    pullRequestReview { id }
  }
}`

const SUBMITTED: Record<z.output<typeof SubmitReviewRequest>['event'], string> =
  {
    APPROVE: 'Approved',
    REQUEST_CHANGES: 'Changes requested on',
    COMMENT: 'Reviewed',
  }

// Submits the viewer's pending review with its line comments, or a new review with only the
// verdict and summary. GitHub itself refuses approving or requesting changes on your own PR, and
// a comment-only review with nothing in it.
export function submitReview(
  tracking: Tracking,
  request: z.output<typeof SubmitReviewRequest>,
): Promise<ActionResult> {
  return action(tracking, request.root, async (repo) => {
    const target = await reviewTarget(repo, request.number)
    if ('problem' in target) {
      return failure(`Couldn't reach #${request.number}: ${target.problem}`)
    }
    const { event, body } = request
    if (event !== 'APPROVE' && body === '' && target.pending === null) {
      return failure('Write a summary, or add a line comment, first')
    }
    const answer =
      target.pending === null
        ? await graphql(repo.root, Anything, SUBMIT_NEW, {
            pull: target.pull,
            event,
            body,
          })
        : await graphql(repo.root, Anything, SUBMIT_PENDING, {
            review: target.pending,
            event,
            body,
          })
    return done(
      answer,
      `${SUBMITTED[event]} #${request.number}`,
      "Couldn't submit the review",
    )
  })
}
