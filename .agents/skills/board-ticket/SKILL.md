---
name: board-ticket
description: Write and file tickets on the stack monitor's ticket board in the repo's shape, through its `board_*` tools. Use when asked for board tickets, or to fill in an existing one (`BEANS-3`). GitHub issues stay with `github-issue`.
---

# Board Ticket Writer

A board ticket is the same **scoped** brief as a GitHub issue, filed through the board's tools instead of `gh`. Read `.agents/skills/github-issue/SKILL.md` § 2 to § 4 (look into it, write it, voice) and follow them with the changes below. Its § 1 and § 5 are `gh`'s: this skill's § 1 and § 3 take their place.

## 1. Find the board

The tools are the stack monitor MCP server's `board_*`, which a session the board starts has. Without them, say so, write the drafts anyway and hand them back as text.

- Project: the prefix the first message names; otherwise `board_list_projects`, asking when more than one fits.
- `board_list_tickets` (`project`) gives its columns, the labels it has and its open tickets.
- Ask only what the request leaves open (usually just the type).

**Done when** the prefix is known and its board listed. A missing or archived project is refused with the reason: tell the user and stop.

## 2. Write it

What changes from `github-issue` § 3:

- **Title**: its prefix and scope rules. The board takes 200 characters; the ~70 rule still holds. Its Label column applies only through Labels below.
- **Description**: its body template and rules, as markdown passed straight into `description` (no body file). Sections: summary, Scope, Where it lives, Approach, Decisions, Done when, Links; empty ones dropped. Links name board tickets by key (`SM-3`); an ordering is a line there ("after SM-3"), since the board has no blocked-by.
- **No `ready-for-agent`**: a board ticket carries no triage label, assignee or `Closes` (`docs/agents/issue-tracker.md` § Board tickets).
- **Priority**: `urgent`, `high`, `medium`, `low` or `none` (the default), set when the user names one or the interview made it plain.
- **Labels**: only names in the project's label list, a type label (`bug`, `enhancement`) included. The tools create none and refuse an unknown one, so a label the project lacks is left off and named in the draft.
- **Column**: the project's first unless the user names another. **Due date**: `YYYY-MM-DD`, only when given.

**Done when** every draft has a title, a description whose every path was read this session, and fields drawn only from what the project has.

## 3. Draft, then file

Show each draft: a header line (Project, Column, Priority, Labels), the title, then the description. For more than three, use `github-issue` § 5's batch rule (one scratchpad file, a table, one approval; redraft on edits).

On approval, per ticket:

1. `board_list_tickets` again, right before filing. A ticket already covering the deliverable goes to § 4 instead of being filed twice.
2. `board_create_ticket` (`project`, `title`, `description`, plus `column`, `priority`, `dueOn`, `labels` only when set). It answers `Created <key>`.

A refusal names what the project has (its columns or labels): correct that field and retry once. A second refusal, or any other failure, stops the batch: report what was filed, by key, and what wasn't, so a retry files no duplicates.

**Done when** every approved draft has a key and the user has the list.

## 4. Fill in an existing ticket

1. `board_get_ticket` (`key`): the description and the comments, which can hold decisions already made.
2. Draft the new title and description in § 2's shape, keeping what still holds, and show it. The old description isn't kept anywhere, so nothing is written before the user approves.
3. On approval, read the ticket again with `board_get_ticket`. If its title, description or labels differ from what the draft was built on, someone edited it meanwhile: redraft from the fresh copy and show it again instead of writing.
4. `board_update_ticket` (`key`, and only the fields that change). `labels` replaces the whole set, so pass the ones the fresh read has plus the new. It leaves the column alone.

**Done when** the tool answers `Saved <key>` and the user is told.
