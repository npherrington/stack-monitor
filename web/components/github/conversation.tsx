import { Bot, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import type {
  PullCommit,
  PullDetail,
  PullFile,
  ReviewState,
  TimelineItem,
} from '../../../core/types.ts'
import { Markdown } from '@/components/github/markdown.tsx'
import { ReviewThread } from '@/components/github/review-thread.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card } from '@/components/ui/card.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import { Tip } from '@/components/ui/tooltip.tsx'
import { useReviewMutations } from '@/hooks/use-review-mutations.ts'
import { cn } from '@/lib/utils.ts'

const VERDICT: Record<
  ReviewState,
  { label: string; tone: 'good' | 'problem' | 'neutral' }
> = {
  APPROVED: { label: 'approved', tone: 'good' },
  CHANGES_REQUESTED: { label: 'requested changes', tone: 'problem' },
  COMMENTED: { label: 'reviewed', tone: 'neutral' },
  DISMISSED: { label: 'review dismissed', tone: 'neutral' },
}

// A comment past this many lines, or characters, starts cut short behind Show more.
const LONG_LINES = 12
const LONG_CHARS = 900

const isLong = (body: string) =>
  body.split('\n').length > LONG_LINES || body.length > LONG_CHARS

// Sticks under the PR's bar on a wide screen and scrolls on its own, so only the discussion makes
// the page long.
const SIDE_COLUMN =
  'flex min-h-0 flex-col gap-2 xl:sticky xl:top-16 xl:max-h-[calc(100dvh-5rem)]'

interface PostProps {
  author: string
  at: string
  url: string
  badge?: ReactNode
  body: string
  bot?: boolean
}

// One comment, review or the description: who and when, then the markdown. A bot's starts as its
// header line alone; a long one is cut short until Show more.
function Post({ author, at, url, badge, body, bot = false }: PostProps) {
  const long = isLong(body)
  const [open, setOpen] = useState(!bot)
  const [full, setFull] = useState(!long)
  const empty = body.trim() === ''

  return (
    <Card className="gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {bot && (
          <Bot className="size-3.5 text-muted-foreground" aria-label="bot" />
        )}
        <span className="font-semibold text-strong">{author}</span>
        {badge}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:underline"
        >
          {new Date(at).toLocaleString()}
        </a>
        <span className="flex-1" />
        {bot && !empty && (
          <Button
            variant="ghost"
            size="xs"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <ChevronDown /> : <ChevronRight />}
            {open ? 'Hide' : 'Show'}
          </Button>
        )}
      </div>
      {open && !empty && (
        <>
          <div className={cn(!full && 'max-h-72 overflow-hidden')}>
            <Markdown text={body} />
          </div>
          {long && (
            <Button
              variant="ghost"
              size="xs"
              className="self-start"
              onClick={() => setFull(!full)}
            >
              {full ? 'Show less' : 'Show more'}
            </Button>
          )}
        </>
      )}
    </Card>
  )
}

interface EntryProps {
  item: TimelineItem
}

function Entry({ item }: EntryProps) {
  return (
    <Post
      author={item.author}
      at={item.at}
      url={item.url}
      bot={item.bot}
      body={item.body}
      badge={
        item.kind === 'review' ? (
          <Pill tone={VERDICT[item.state].tone}>
            {VERDICT[item.state].label}
          </Pill>
        ) : undefined
      }
    />
  )
}

interface CommitListProps {
  commits: PullCommit[]
}

function CommitList({ commits }: CommitListProps) {
  return (
    <section className={SIDE_COLUMN}>
      <h2 className="text-sm font-semibold text-strong">
        Commits ({commits.length})
      </h2>
      <Card className="min-h-0 gap-0 overflow-y-auto py-0">
        <ol className="divide-y">
          {commits.map((commit) => (
            <li key={commit.sha}>
              <Tip
                label={`${commit.author} · ${new Date(commit.at).toLocaleString()}`}
                side="left"
              >
                <a
                  href={commit.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 text-xs outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
                >
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {commit.headline}
                  </span>
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {commit.sha.slice(0, 7)}
                  </span>
                </a>
              </Tip>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  )
}

function splitPath(path: string): { folder: string; name: string } {
  const at = path.lastIndexOf('/')
  return at === -1
    ? { folder: '', name: path }
    : { folder: path.slice(0, at + 1), name: path.slice(at + 1) }
}

interface FileListProps {
  files: PullFile[]
  threadsOn: Map<string, number> // threads by path
  onOpen: (path: string) => void
}

function FileList({ files, threadsOn, onOpen }: FileListProps) {
  return (
    <section className={SIDE_COLUMN}>
      <h2 className="text-sm font-semibold text-strong">
        Files changed ({files.length})
      </h2>
      <Card className="min-h-0 gap-0 overflow-y-auto py-0">
        <ul className="divide-y">
          {files.map((file) => {
            const { folder, name } = splitPath(file.path)
            const threads = threadsOn.get(file.path) ?? 0
            return (
              <li key={file.path}>
                <button
                  type="button"
                  title={file.path}
                  onClick={() => onOpen(file.path)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-xs outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
                >
                  <span className="flex min-w-0 flex-1">
                    <span className="min-w-0 truncate text-muted-foreground">
                      {folder}
                    </span>
                    <span className="shrink-0 text-foreground">{name}</span>
                  </span>
                  {threads > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground">
                      <MessageSquare className="size-3" aria-hidden="true" />
                      <span className="sr-only">threads:</span>
                      {threads}
                    </span>
                  )}
                  <span className="shrink-0 text-success tabular-nums">
                    +{file.additions}
                  </span>
                  <span className="shrink-0 text-destructive tabular-nums">
                    −{file.deletions}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </Card>
    </section>
  )
}

interface ConversationProps {
  root: string
  pull: PullDetail
  onOpenFile: (path: string) => void // shows the file in Files changed
}

// The PR at a glance, in three columns on a wide screen: the discussion (what it says, comments and
// reviews in order, then every line thread), its commits, and the files it changes.
export function Conversation({ root, pull, onOpenFile }: ConversationProps) {
  const { reply, resolve, deleteComment, isResolving, isDeleting } =
    useReviewMutations(root, pull.number)
  const threadsOn = new Map<string, number>()
  for (const thread of pull.threads) {
    threadsOn.set(thread.path, (threadsOn.get(thread.path) ?? 0) + 1)
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_16rem_17rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-strong">Summary</h2>
          <Post
            author={pull.author}
            at={pull.createdAt}
            url={pull.url}
            body={pull.body.trim() === '' ? '_No description._' : pull.body}
          />
        </section>
        {pull.timeline.length > 0 && (
          <section className="flex flex-col gap-2 pt-2">
            <h2 className="text-sm font-semibold text-strong">
              Comments ({pull.timeline.length})
            </h2>
            <div className="flex flex-col gap-3">
              {pull.timeline.map((item) => (
                <Entry key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}
        {pull.threads.length > 0 && (
          <section className="flex flex-col gap-3 pt-2">
            <h2 className="text-sm font-semibold text-strong">
              Line threads ({pull.threads.length})
            </h2>
            {pull.threads.map((thread) => (
              <div key={thread.id} className="flex flex-col gap-1">
                <span className="font-mono text-xs break-all text-muted-foreground">
                  {thread.path}
                  {thread.line !== null && `:${thread.line}`}
                </span>
                <ReviewThread
                  thread={thread}
                  hasPendingReview={pull.pendingReview !== null}
                  onReply={reply}
                  onResolve={resolve}
                  onDelete={deleteComment}
                  isBusy={isResolving || isDeleting}
                />
              </div>
            ))}
          </section>
        )}
      </div>
      <CommitList commits={pull.commits} />
      <FileList files={pull.files} threadsOn={threadsOn} onOpen={onOpenFile} />
    </div>
  )
}
