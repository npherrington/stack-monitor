# React Forms

Applies to: any component that collects input and submits it: create forms (a worktree, a run, a
schedule), filter bars, dialogs and popovers with a field in them.

No form exists yet; the first one becomes the example for every section below.

Every form is **react-hook-form + a zod schema + the `ui/field` components**, submitted by an
async `onSubmit`. No `useState` per field, no hand-written `validate()`, no bare `<input>`.

```
schema above the component  →  useForm({ resolver })  →  <Controller>s   →  async onSubmit
(zod schema + inferred type)    (state + validation)      (shadcn Fields)     (awaits the mutation)
```

The first form adds the field components: `npx shadcn@4.23.0 add field input` (and `select`,
`textarea`, `switch` as fields need them). `base-lyra`'s `field` is the one to use; its `form`
item is empty.

---

## One Schema per Component, Defined Above It

Each form component defines its schema at the top of its own file, above the component, with the
type inferred from it. The type is the form's values type; don't write it by hand.

```tsx
const createWorktreeFormSchema = z.object({
  branch: z
    .string()
    .trim()
    .min(1, 'Name the branch.')
    .regex(/^[\w./-]+$/, 'Use letters, digits, ., /, _ and - only.'),
  from: z.enum(['existing', 'remote', 'new']),
  // '' when the repo gives worktrees no index
  index: z.string(),
})

type CreateWorktreeFormValues = z.infer<typeof createWorktreeFormSchema>

export function CreateWorktreeForm({ freeIndexes }: CreateWorktreeFormProps) {
  // ...
}
```

The schema and the fields change together, so they stay in one file. A schema moves out only when
something outside its component needs it:

| Schema                                             | Lives in                                              |
| -------------------------------------------------- | ----------------------------------------------------- |
| Used by one component                              | above that component, same file                       |
| A building block used across forms (a branch name) | `web/lib/form-schemas.ts`, created with the first one |
| The rules a route's body already has in `core/`    | `core/`: the form imports it or derives from it       |

- **Zod in `web/` validates form input, nothing else.** What a route answers is a type from
  `core/types.ts` (`docs/style-guides/react-data-fetching.md` § Types Come From `core/types.ts`).
- **Reuse the server's rules rather than restate them.** Where a route's body has a zod schema in
  `core/`, the form imports it or derives from it, so the page and the server can't disagree about
  what's valid. A schema the page imports lives in Node-free code (`core/types.ts`'s rule).
- **Name the pair `<thing>FormSchema` / `<Thing>FormValues`.**
- **Derive variants rather than copy them**: `.omit()`, `.extend()` or `.partial()` on the base
  schema.
- **Cross-field rules go in `.refine()` with a `path`**, so the message lands on the field that has
  to change: a new branch can't take the name of one that exists.

---

## The Form

```tsx
const form = useForm<CreateWorktreeFormValues>({
  resolver: zodResolver(createWorktreeFormSchema),
  defaultValues: { branch: '', from: 'new', index: '' },
})
const { isSubmitting } = form.formState

return (
  <form
    noValidate
    onSubmit={form.handleSubmit(onSubmit)}
    className="flex flex-col gap-5"
  >
    <Controller
      control={form.control}
      name="branch"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={field.name}>Branch</FieldLabel>
          <Input
            {...field}
            id={field.name}
            autoComplete="off"
            aria-invalid={fieldState.invalid}
          />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
    <Button type="submit" className="self-end" disabled={isSubmitting}>
      {isSubmitting ? 'Creating…' : 'Create worktree'}
    </Button>
  </form>
)
```

- **Submit through `form.handleSubmit`.** It validates, then calls `onSubmit` without the browser
  submitting the form. A native submit goes nowhere: the CSP in `server/static.ts` has
  `form-action 'none'`.
- **`defaultValues` for every field.** Without it an input starts uncontrolled and React warns
  when it gets a value. `form.reset()` also returns to these values.
- **Every field is a `Controller` → `Field` → `FieldLabel` + the input + `FieldError`.** The input
  takes `id={field.name}` to match the label's `htmlFor`, and `aria-invalid` to mark it;
  `FieldError` shows the zod message with `role="alert"`. A field without them validates silently.
- **The input comes from `components/ui/`**: `Input`, `Textarea`, `Select`, `Switch`. Add a shadcn
  component before styling a native element.
- **Inputs that don't produce a string need adapting at the field.** A `Select` over index numbers
  passes `onValueChange={(value) => field.onChange(Number(value))}`; one over strings takes
  `value={field.value}` and `onValueChange={field.onChange}`.
- **Validation `mode` stays at the default** (validate on submit, then re-validate on change)
  unless the form has a reason to show errors while typing.

---

## Submit With an Async `onSubmit`

`form.handleSubmit(onSubmit)` validates against the schema and calls `onSubmit` only with values
that passed, typed as `<Thing>FormValues`. Make `onSubmit` async and **await** the request.
react-hook-form keeps `formState.isSubmitting` true until the promise settles, which is what
disables the button and stops a double submit. A create that runs the repo's `setup` hook takes
a while to answer, so this matters here.

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
  onCreated()
}
```

- **Await the call.** An `async` function that only calls a TanStack `mutate()` resolves
  immediately, so `isSubmitting` never covers the request. With a mutation, await `mutateAsync()`
  instead, inside `try`/`catch`.
- **Call the server through a mutation hook**, never `fetch` from the form
  (`docs/style-guides/react-data-fetching.md`).
- **A refusal is the toast, and the form keeps what was typed.** `ActionResult` names no field, so
  the server's `message` goes in the failure toast (`docs/style-guides/react-toasts.md`) and the
  dialog stays open. Check in the schema what the page can know before sending (a free index, a
  branch name git accepts), so the refusals left are the ones only the machine can answer.
- **Reset after success**: `form.reset()` for a create, `form.reset(saved)` to the saved values
  for an edit, so `isDirty` is false again. An edit form's button takes
  `disabled={!isDirty || isSubmitting}`, so an unchanged form can't be resubmitted.
