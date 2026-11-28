# Issue tracker: GitHub Issues

Issues and specs for this repo live in GitHub Issues on `npherrington/stack-monitor`, reached through the `gh` CLI. Run from a clone, `gh` picks the repo up itself. If `gh auth status` fails, say so and ask for the issue's contents instead of guessing from the URL.

## Conventions

- **Read an issue**: `gh issue view <n> --json number,title,body,state,stateReason,labels,assignees,author,comments,closedByPullRequestsReferences,url`. `<n>` is the number, `#123` without the `#`, or the URL. Images in the body and comments are markdown links: fetch any that bear on the issue.
- **List issues**: `gh issue list`, with `--label`, `--assignee`, `--state` and `--search` (GitHub's search syntax: `-label:x`, `no:assignee`, `-linked:pr`, `sort:created-asc`). Ask for `--json` fields and a `--limit` big enough that the list isn't cut short (the default is 30).
- **Create an issue**: the `github-issue` skill, which writes the title and body in the repo's shape.
- **Comment**: `gh issue comment <n> --body-file <file>`. Write the body to a file in the scratchpad first, so newlines and backticks arrive as written.
- **Labels**: `gh issue edit <n> --add-label a,b --remove-label c`. Both flags change only the labels they name. `gh label list --json name` shows what exists; a label missing there hasn't been applied from `.github/labels.json` (`docs/agents/triage-labels.md`).
- **Assign**: `gh issue edit <n> --add-assignee @me`.
- **Close**: `gh issue close <n> --reason "not planned" --comment "<why>"`, or `--duplicate-of <m>` for a duplicate. A merged PR whose body says `Closes #<n>` closes the issue as completed on its own.
- **Link a PR**: `Closes #<n>` in the PR body. That line is the link between them: the issue lists the PR under `closedByPullRequestsReferences` while it's open.

Status lives in the issue's state, labels and assignee: `docs/agents/triage-labels.md` § Status.

## Board tickets

An id shaped `PREFIX-N` (`BEANS-3`) is a ticket on the stack monitor's own ticket board, not a GitHub issue. It is reached through the monitor's MCP tools (`board_*`), which a session started from the board has. A session without those tools can't work one: say so and stop.

- **Read**: `board_get_ticket` (`key`). Its description and comments are the spec.
- **Create or fill in**: the `board-ticket` skill, which writes the title and description in the repo's shape.
- **Status** is the ticket's column. Started: `board_move_ticket` (`key`, `column`) to "In progress", then a comment. PR open: move to "In review", then a comment with the PR's link. A column the project doesn't have is refused with the names it has: use the closest.
- **Comment**: `board_add_comment` (`key`, `body`), wherever a skill says "issue comment", a stop's included.
- **No label, assignee or `Closes #<n>`.** A person pressed the button, so the `ready-for-agent` check doesn't apply. The PR's summary names the key instead.

## Pull requests as a triage surface

**PRs as a request surface: no.** `/triage` works on issues only. PRs are opened through the `pull-request` skill.

## When a skill says "publish to the issue tracker"

Create a GitHub issue with the `github-issue` skill.
