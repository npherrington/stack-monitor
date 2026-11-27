// An agentic review: a Claude Code session, in a review worktree the monitor makes or a checkout
// the user picked, whose first message carries the PR and how to post the review. The agent posts
// through gh, under Claude Code's own permission rules; the monitor posts nothing.
import { z } from 'zod'

import { listSkills, SkillName } from '../agents/skills.ts'
import { trackedRepo } from '../config/sections.ts'
import { Focus } from '../fields.ts'
import { PathText } from '../repos.ts'
import type { Tracking } from '../settings.ts'
import {
  alreadyOpen,
  claudeOpenIn,
  openTerminal,
} from '../terminals/sessions.ts'
import { failure, type SkillInfo, type StartedSession } from '../types.ts'
import { canonical, listWorktrees } from '../worktrees/clone.ts'
import {
  makeReviewWorktree,
  reviewWorktreePath,
  type ReviewWorktree,
} from '../worktrees/review.ts'
import { PullNumber, readPull } from './github.ts'
import {
  REPO_NAME,
  REVIEW_TOOLS,
  reviewMessage,
  type ReviewedPull,
} from './review-prompt.ts'

export const AgenticReviewRequest = z.strictObject({
  root: PathText,
  number: PullNumber,
  path: PathText.nullable(), // null: make or move the review worktree
  skill: SkillName.nullable(),
  focus: Focus.default(''),
})

function refused(message: string): StartedSession {
  return { ...failure(message), session: null }
}

// Everything after the PR was read: no gh from here on. root: a tracked repo's, already checked;
// skill: the repo's skill the request names, already found.
export async function launchReview(
  tracking: Tracking,
  root: string,
  pull: ReviewedPull,
  request: z.output<typeof AgenticReviewRequest>,
  skill: SkillInfo | null,
  options: { runs?: string } = {},
): Promise<StartedSession> {
  if (!REPO_NAME.test(pull.repo)) {
    return refused("GitHub's name for this repo isn't owner/name")
  }
  let path = request.path
  let made: ReviewWorktree | null = null
  if (path === null) {
    // Asked before anything is fetched or moved: the session couldn't open there anyway.
    const target = reviewWorktreePath(root, pull.number)
    if (claudeOpenIn(target) !== undefined) return refused(alreadyOpen(target))
    const worktree = await makeReviewWorktree(
      tracking,
      root,
      { number: pull.number, base: pull.base, fork: pull.crossRepository },
      options,
    )
    if ('refused' in worktree) return refused(worktree.refused)
    made = worktree
    path = worktree.path
  }
  const opened = await openTerminal(
    tracking,
    { root, path, kind: 'claude' },
    {
      kind: 'review',
      title: `Review #${pull.number}`,
      message: reviewMessage(pull, made, skill, request.focus),
      allowedTools: REVIEW_TOOLS,
    },
  )
  if ('ok' in opened) {
    return refused(
      made === null
        ? opened.message
        : `${made.message}, but couldn't open Claude Code in it: ${opened.message}`,
    )
  }
  return {
    ok: true,
    message:
      made?.message ?? `Opened a review of #${pull.number} in ${opened.path}`,
    log: made?.log ?? null,
    session: opened,
  }
}

export async function startAgenticReview(
  tracking: Tracking,
  request: z.output<typeof AgenticReviewRequest>,
): Promise<StartedSession> {
  const repo = trackedRepo(tracking, request.root)
  if ('problem' in repo) return refused(repo.problem)
  if ('refused' in repo) return refused(repo.refused)
  const { path } = request
  const skill =
    request.skill === null
      ? null
      : listSkills(repo.root).find((each) => each.name === request.skill)
  if (skill === undefined) {
    return refused(`${repo.root} has no skill named ${request.skill}`)
  }
  // What can be refused without asking GitHub is refused first.
  if (path !== null) {
    const wanted = canonical(path)
    const worktree = (await listWorktrees(repo.root)).find(
      (each) => canonical(each.path) === wanted,
    )
    if (worktree === undefined) {
      return refused(`${path} isn't a worktree of ${repo.root}`)
    }
    if (claudeOpenIn(worktree.path) !== undefined) {
      return refused(alreadyOpen(worktree.path))
    }
  }
  const pull = await readPull(tracking, repo.root, request.number)
  if ('problem' in pull) return refused(pull.problem)
  if ('refused' in pull) return refused(pull.refused)
  return launchReview(tracking, repo.root, pull, request, skill)
}
