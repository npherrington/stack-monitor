// Text someone else wrote (a PR's title and description, a ticket's title, a project's name), on
// its way into a message the monitor writes for a session. The message is one argument of
// `claude` and is drawn in a terminal, so control characters never go through.

// A title, a name or a branch: on one line, clipped.
export function oneLine(text: string, max: number): string {
  // oxlint-disable-next-line no-control-regex -- control characters are what it takes out
  const flat = text.replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

// The skill a session is told to use. Claude Code lists the skills under .claude/skills; one a repo
// keeps only under .agents/skills isn't in that list, so the file is named too.
export function skillClause(skill: { name: string; path: string }): string {
  return `the ${skill.name} skill (${oneLine(skill.path, 200)} in this repo; read that file if your skill list doesn't have it)`
}

// A longer text, clipped and wrapped in <tag>…</tag>, so the message can say whose words are
// inside. The tag's own closing form is taken out of the text, which then can't end its fence.
export function fenced(tag: string, text: string, max: number): string {
  const closing = new RegExp(`<\\s*/\\s*${tag}\\s*>`, 'gi')
  const clean = text
    // oxlint-disable-next-line no-control-regex -- control characters are what it takes out
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .replace(closing, '')
    .trim()
  const body =
    clean.length > max
      ? `${clean.slice(0, max)}\n[clipped: ${clean.length - max} more characters]`
      : clean
  return `<${tag}>\n${body}\n</${tag}>`
}
