# React Toasts

Applies to: `web/**`. Any time the page tells the user that something worked, failed, or didn't
happen.

**Feedback on an action is a toast.** Not `alert()`, not an inline status line that appears after
submit, and not a `console.error` the user never sees.

No toast exists yet; the first action adds it and becomes the example for every section below.

---

## Adding the Toast

Use `base-lyra`'s Base UI toast: `npx shadcn@4.23.0 add toast`. It needs only `@base-ui/react` and
`cn`, both installed. `base-lyra`'s `sonner` item brings `sonner` and `next-themes`, a second theme
system beside the one PLAN.md step 8 adds.

What the CLI writes needs two changes on the way in:

- **Its file exports `toast`, `createToastManager` and `useToastManager` beside the components.**
  Move those into a `.ts` file beside it, as `button-variants.ts` is beside `button.tsx`
  (`docs/style-guides/react-components.md` § Files and Exports).
- **`<Toaster>` is a provider and takes children.** It wraps `<RouterProvider>` inside
  `QueryClientProvider` in `web/app.tsx`, with `limit={1}`, so a second toast replaces the first
  rather than stacking (`docs/style-guides/react-providers.md` § The Provider Tree).

`toast` is a module-level manager (`toast.add(...)`), so a hook, a component or a `web/lib/`
function raises one the same way, with no hook call.

---

## Types

| `type`    | Use it for                                                  |
| --------- | ----------------------------------------------------------- |
| `success` | The action the user asked for went through (`ok: true`)     |
| `error`   | It didn't: the server refused (`ok: false`) or wasn't there |
| `info`    | Neutral information. Rare; prefer one of the two above      |

Always pass `type`. `base-lyra`'s toast picks its icon from it, and one without reads as a page
element rather than a result.

---

## Raising One

Every action ends in exactly one toast, success or failure. The failure one comes from one
function in `web/lib/` (`toastFailure` below), added with the first mutation:

```tsx
async function onSubmit(values: CreateWorktreeFormValues) {
  let result: ActionResult
  try {
    result = await createWorktree(values)
  } catch (error) {
    toastFailure(error, "Couldn't create the worktree")
    return
  }
  form.reset()
  toast.add({
    type: 'success',
    title: 'Worktree created',
    description: result.message,
  })
}
```

- **Title says what happened, description says to what or why.** "Service stopped" with
  "api in stack-monitor-try-1"; "Couldn't start web" with the server's reason. Name the thing
  ("Worktree removed", "Run started"), not "Success".
- **A failure toast is written for the person reading it.** The description is one of two things:
  1. The `message` of an error the fetch layer threw. That's the server's `ActionResult.message`,
     written for display, or the fetch layer's own "isn't answering" sentence
     (`docs/style-guides/react-data-fetching.md` § The Fetch Layer).
  2. For anything else that throws (a bug in the page), a fixed sentence about the action:
     "Couldn't start web" with "Try again."

  A status line ("/api/x answered 500"), a JSON body or `String(error)` of an unknown error stays
  in the console; it says nothing the user can act on.

- **A failure with a log offers it.** When the `ActionResult`'s `log` isn't null, that's where the
  reason is: the toast's action (`actionProps`) opens it.
- **A toast confirms; it doesn't replace field errors.** A value that fails the zod schema shows
  under its field via `FieldError` (`docs/style-guides/react-forms.md`). Toast what the server
  answers.
- **Close the dialog or popover on success, keep it open on failure**, so the user can fix and
  retry without re-entering anything.

---

## Toasts Answer Actions, Not Queries

A toast is a reply to something the user did. A query runs without the user doing anything: on
mount, whenever the window regains focus (TanStack's default `refetchOnWindowFocus`), and on every
`refetchInterval` tick. Tie a toast to a query's error and it fires again on each failed refetch,
because each failure is a new `error` object and `useEffect(..., [error])` runs again. With the
monitor stopped, a page polling a checkout's services raises a red toast every tick, and nothing
the user does stops it.

| Source                                                | Feedback                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| A mutation the user triggered (start, stop, create)   | Toast, success and failure                                                |
| A query that loads the page's data                    | An error state where the data would be, as `overview.tsx` renders         |
| A query with `refetchInterval` (services, runs, logs) | Never a toast. Keep showing the last data, with a "couldn't refresh" note |

- **Mutation failures go through one function**, `toastFailure(error, title)` in `web/lib/`,
  called from the `catch` around `mutateAsync` or from the mutation's `onError`. It picks the
  description by the rules above and offers the log. A component never builds a per-status toast.
- **If a non-polling query's failure really needs a toast**, raise it once per failure streak,
  when the query moves into the error state, not every time `error` changes.

---

## Other Feedback

- **A question before a destructive action is an `AlertDialog`**, never `window.confirm()`:
  removing a worktree, stopping a run.
- **Red is for failure only.** An answer that counts as done (`ok: true` on a Stop for a service
  that was already down) is a success toast or none.
- **One action, one toast.** A flow that stops a service and then refreshes the list says once
  what happened.
