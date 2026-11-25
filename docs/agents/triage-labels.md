# Triage Labels

How the `triage` skill's roles map onto GitHub Issues. GitHub has no Triage status, so everything triage decides is a label, plus the issue's open or closed state.

## State

| Role              | On GitHub                                           | Meaning                                           |
| ----------------- | --------------------------------------------------- | ------------------------------------------------- |
| not evaluated     | open, with `needs-triage` or with no category label | Maintainer needs to evaluate this issue           |
| `needs-info`      | open, `needs-info`                                  | Waiting on reporter for more information          |
| `ready-for-agent` | open, `ready-for-agent` and a category label        | Fully specified, an unattended agent can build it |
| `ready-for-human` | open, `ready-for-human` and a category label        | Requires human implementation                     |
| `wontfix`         | closed as not planned or as a duplicate, `wontfix`  | Will not be actioned                              |

"Not evaluated" has two spellings, treated the same: an issue someone filed straight on GitHub, which carries no category label, and `needs-triage`, for one that's already been accepted and should be looked at again, or that the `github-issue` skill filed for triage.

`needs-triage` is removed when the issue is acted on, so it never sits next to another state label. An open issue with a category label and no state label is accepted: wanted, but not agent-ready.

## Category

One per issue, GitHub's own labels:

| Role          | Label         | For                                                          |
| ------------- | ------------- | ------------------------------------------------------------ |
| broken        | `bug`         | something that doesn't do what it says                       |
| better or new | `enhancement` | a new capability, a better existing one, a refactor or chore |

Any other label (`documentation`, `good first issue`, `question`, ...) is not a triage role. Leave it as it is.

## Status

The statuses a workflow tracker has, and what each reads as on GitHub. Nothing here is set by hand except the assignee: the rest follows from labels, the linked PR and closing.

| Status      | On GitHub                                                                              |
| ----------- | -------------------------------------------------------------------------------------- |
| Triage      | open and not evaluated (above)                                                         |
| Backlog     | open, a category label, no assignee                                                    |
| In Progress | open, assigned (`gh issue edit <n> --add-assignee @me`)                                |
| In Review   | open, with an open PR whose body says `Closes #<n>` (`closedByPullRequestsReferences`) |
| Done        | closed as completed, which merging that PR does                                        |
| Canceled    | closed as not planned (`gh issue close <n> --reason "not planned"`), `wontfix`         |
| Duplicate   | closed as a duplicate (`gh issue close <n> --duplicate-of <m>`), `wontfix`             |

## Unattended runs

`ready-for-agent` is the gate: an unattended run (`STACK_MONITOR_UNATTENDED=1`) on an issue without it comments and stops. See `docs/agents/unattended.md`. A small issue skips the grill by having a maintainer apply the label directly (the skill's quick override).

## Applying the labels

`.github/labels.json` lists every label above with its colour and description. Run this once from a clone, and again after changing the file. `--force` updates a label that already exists, so GitHub's own `bug`, `enhancement` and `wontfix` keep the values the file copies from them.

```sh
jq -r '.[] | [.name, .color, .description] | @tsv' .github/labels.json |
  while IFS=$'\t' read -r name color description; do
    gh label create "$name" --color "$color" --description "$description" --force
  done
```
