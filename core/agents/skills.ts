// A repo's skills, read from their SKILL.md frontmatter, and the prompts that have an agent draft a
// new one or improve a piece of text.
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import { PathText } from '../repos.ts'
import type { SkillInfo } from '../types.ts'
import { AgentIdSchema, ModelName } from './settings.ts'

// .agents/skills first: it's where a draft goes, and .claude/skills is often a link to it.
export const SKILL_DIRS = ['.agents/skills', '.claude/skills']
const MAX_TEXT = 4000

export const SkillName = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
    'must be lowercase letters and digits in words joined by -',
  )
  .max(64)

export const DraftSkillRequest = z.strictObject({
  checkout: PathText,
  name: SkillName,
  purpose: z.string().trim().min(1).max(MAX_TEXT),
  triggers: z.string().trim().min(1).max(MAX_TEXT),
  agent: AgentIdSchema.optional(),
  model: ModelName.nullable().optional(),
})

export const ImprovePromptRequest = z.strictObject({
  checkout: PathText,
  kind: z.enum(['skill', 'step']),
  text: z.string().trim().min(1).max(16_000),
  agent: AgentIdSchema.optional(),
  model: ModelName.nullable().optional(),
})

function unquote(value: string): string {
  const quoted = /^(["'])(.*)\1$/.exec(value)
  return quoted === null ? value : quoted[2]
}

// The `key: value` lines between a leading pair of --- lines. Enough YAML for a skill's header: a
// plain or quoted value, a value continued on indented lines, and a > or | block.
export function readFrontmatter(text: string): Record<string, string> {
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return {}
  const end = lines.findIndex((line, at) => at > 0 && line.trim() === '---')
  if (end === -1) return {}
  const fields: Record<string, string> = {}
  let key: string | null = null
  let block: '>' | '|' | null = null
  const parts: string[] = []
  const close = () => {
    if (key === null) return
    const joined =
      block === '|' ? parts.join('\n') : parts.join(' ').replace(/\s+/g, ' ')
    fields[key] = unquote(joined.trim())
  }
  for (const line of lines.slice(1, end)) {
    const field = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (field !== null) {
      close()
      key = field[1]
      parts.length = 0
      const value = field[2].trim()
      block = /^[>|][+-]?$/.test(value) ? (value[0] as '>' | '|') : null
      if (block === null && value !== '') parts.push(value)
      continue
    }
    if (key !== null && /^\s/.test(line)) parts.push(line.trim())
  }
  close()
  return fields
}

export function listSkills(root: string): SkillInfo[] {
  const seen = new Set<string>()
  const skills: SkillInfo[] = []
  for (const base of SKILL_DIRS) {
    let names: string[]
    try {
      names = readdirSync(join(root, base))
    } catch {
      continue
    }
    for (const name of names.toSorted()) {
      const file = join(root, base, name, 'SKILL.md')
      let real: string
      let text: string
      try {
        real = realpathSync.native(file)
        text = readFileSync(real, 'utf8')
      } catch {
        continue
      }
      if (seen.has(real)) continue
      seen.add(real)
      const header = readFrontmatter(text)
      skills.push({
        name: header.name || name,
        description: header.description || null,
        path: `${base}/${name}/SKILL.md`,
      })
    }
  }
  return skills.toSorted((a, b) => a.name.localeCompare(b.name))
}

export function skillExists(checkout: string, name: string): boolean {
  return SKILL_DIRS.some((base) =>
    existsSync(join(checkout, base, name, 'SKILL.md')),
  )
}

// Distilled from .agents/skills/writing-for-agents (SKILL.md and SKILL-MECHANICS.md).
const SKILL_RULES = `How to write it:
- Frontmatter: \`name\` (the folder name) and \`description\`. The description is the trigger the agent reads on every turn: one clause saying what the skill is, then "Use when" and the distinct cases that should fire it, each named once with the words a user would actually type. No synonyms of one case, nothing the body repeats.
- Body: steps or reference, or both. Steps are what the agent does, in order, each ending on a done-when the agent can check ("every changed file listed", not "understand the code"). Reference is the rules and facts it consults on demand; keep each concept's definition, rules and caveats under one heading.
- Inline what every case needs. Material only some cases reach goes in a sibling file in the skill's folder, named from the body with the condition for reading it.
- Say what to do, not what to avoid. Keep a prohibition only as a hard guardrail, paired with what to do instead.
- One place for each rule. Leave out what the repo already shows (package.json scripts, config files, --help output) unless looking it up is expensive; write down the unwritten convention, the reason behind a choice, the gotcha no config confesses.
- Cut every sentence the agent would follow anyway. Prefer one precise word to a sentence gesturing at an idea.
- Short: a document that grows long thins the agent's attention. Under about 150 lines.`

export interface SkillDraft {
  name: string
  purpose: string
  triggers: string
  linkClaude: boolean // the checkout has .claude/ but no .claude/skills
}

export function skillDraftPrompt({
  name,
  purpose,
  triggers,
  linkClaude,
}: SkillDraft): string {
  const link = linkClaude
    ? `\n\nThis repo has a .claude/ folder without .claude/skills. Create .claude/skills as a symlink to ../.agents/skills (\`ln -s ../.agents/skills .claude/skills\`), so Claude Code finds the skill too.`
    : ''
  return `Create the agent skill \`${name}\` in this repo, at .agents/skills/${name}/SKILL.md.

What it's for:
${purpose}

When it should be used:
${triggers}

Work only inside this repo. Read the code and docs the skill touches before writing, so its steps name this repo's real files, commands and conventions; read what the steps need and no more. If .agents/skills already holds skills, skim one for the house style; if it's empty, go by the rules below.

${SKILL_RULES}${link}

Write only the skill's own files. Finish with a short report: the files written and the description you chose.`
}

const IMPROVE_SUBJECT = {
  skill: 'an agent skill (a SKILL.md, frontmatter included)',
  step: 'a prompt for one step of a headless agent run',
}

// A read-only run: the answer is the improved text, which the page puts back in the form.
export function improvePrompt(kind: 'skill' | 'step', text: string): string {
  const rules =
    kind === 'skill'
      ? `\n\n${SKILL_RULES}`
      : `\n\nA good step prompt says what done looks like in a way the agent can check, names the files, commands or tickets it starts from, and says what to report at the end. It says what to do rather than what to avoid, and leaves out what the agent would do anyway.`
  return `Improve the text below: ${IMPROVE_SUBJECT[kind]}. You may read the repo to make it specific to this codebase. Edit no files and run nothing that changes anything.${rules}

Answer with only the improved text: no preamble, no explanation, no code fence around it.

The text:
${text}`
}
