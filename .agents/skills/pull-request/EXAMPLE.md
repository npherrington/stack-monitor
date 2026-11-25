# A body with both sections, filled in

Removing a worktree (PLAN.md § Steps, step 1), written as the PR that would add it. It shows the
shape: file, function and component names past what's on `main` are made up for the example, so
take the layout from here and the names from your own diff. Title:
`feat(worktrees): remove a worktree that's safe to remove`.

````markdown
A checkout's row on the page gets a Remove button, and MCP gets `stack_remove_worktree`. Either one
removes a linked worktree and its branch, but only when nothing in it would be lost: no commits
off mainline, no changed files, no session open and no dev server up. Part of #4.

## Server

**Core** · `core/worktrees/`

- `blockers.ts`: `removalBlockers` lists what keeps a checkout from removal: commits not on
  mainline, changed files, an open session, a service up
- `remove.ts`: `removeWorktree` runs the config's `teardown`, then `git worktree remove` (never
  `--force`), then `git branch -d`; a failed teardown stops it before the directory goes

**Routes** · `server/routes.ts` · refuses the primary checkout, else 409

| Route                        | Does                                | Refuses                      | Takes → returns                                |
| ---------------------------- | ----------------------------------- | ---------------------------- | ---------------------------------------------- |
| `POST /api/worktrees/remove` | Removes the checkout and its branch | any blocker, named, else 409 | `{ path }` → `ActionResult` in `core/types.ts` |

**MCP** · `mcp/tools.ts` · `stack_remove_worktree` calls `removeWorktree` and answers its blockers
as the refusal

## Page

**Route** · no new route; it lives on the Checkouts page

**Components**

```
CheckoutsPage             pages/checkouts.tsx    ~  useCheckouts
└─ CheckoutRow            checkouts/             ~
   └─ RemoveCheckout      checkouts/             +  useRemoveWorktree
```

**UI** · `AlertDialog`, `Button`, `Tooltip`; nothing added to `ui/`
**Data** · `useRemoveWorktree` (`POST /api/worktrees/remove`; refetches `useCheckouts` once done)

Testing: `mise run check` (64 tests passed); removed a clean worktree and was refused one with a
changed file, on the page against a fixture repo.

<!-- claude-session: <worktree dir name> <session id> -->
````
