import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import {
  improvePrompt,
  listSkills,
  readFrontmatter,
  skillDraftPrompt,
} from '../core/agents/skills.ts'
import {
  deleteWorkflow,
  listWorkflows,
  saveWorkflow,
  workflowRun,
} from '../core/agents/workflows.ts'
import type { Workflow } from '../core/types.ts'
import { tempDir, writeJson } from './fixtures.ts'

function skill(root: string, base: string, name: string, text: string) {
  mkdirSync(join(root, base, name), { recursive: true })
  writeFileSync(join(root, base, name, 'SKILL.md'), text)
}

describe('skills', () => {
  test('reads the frontmatter name and description, a folded block included', () => {
    assert.deepEqual(
      readFrontmatter(
        '---\nname: "ship-it"\ndescription: >\n  Commit and push.\n  Use when asked to ship.\nother: x\n---\nBody\n',
      ),
      {
        name: 'ship-it',
        description: 'Commit and push. Use when asked to ship.',
        other: 'x',
      },
    )
    assert.deepEqual(
      readFrontmatter(
        "---\ndescription: 'quoted: with a colon'\nname: a\n  continued\n---\n",
      ),
      { description: 'quoted: with a colon', name: 'a continued' },
    )
    assert.deepEqual(readFrontmatter('no header\nname: x\n'), {})
    assert.deepEqual(readFrontmatter('---\nname: unclosed\n'), {})
  })

  test('lists both folders once when .claude/skills links to .agents/skills', () => {
    const root = tempDir()
    skill(
      root,
      '.agents/skills',
      'b-skill',
      '---\nname: b-skill\ndescription: Does B. Use when B.\n---\n',
    )
    skill(root, '.agents/skills', 'a-skill', '# no frontmatter\n')
    mkdirSync(join(root, '.claude'))
    symlinkSync('../.agents/skills', join(root, '.claude', 'skills'))
    assert.deepEqual(listSkills(root), [
      {
        name: 'a-skill',
        description: null,
        path: '.agents/skills/a-skill/SKILL.md',
      },
      {
        name: 'b-skill',
        description: 'Does B. Use when B.',
        path: '.agents/skills/b-skill/SKILL.md',
      },
    ])
  })

  test('a skill only in .claude/skills is listed from there, and a folder without SKILL.md is not', () => {
    const root = tempDir()
    skill(
      root,
      '.claude/skills',
      'only-claude',
      '---\nname: only-claude\n---\n',
    )
    mkdirSync(join(root, '.agents', 'skills', 'empty'), { recursive: true })
    assert.deepEqual(listSkills(root), [
      {
        name: 'only-claude',
        description: null,
        path: '.claude/skills/only-claude/SKILL.md',
      },
    ])
    assert.deepEqual(listSkills(tempDir()), [])
  })

  test('the draft prompt names the file, carries the rules, and asks for the link only when needed', () => {
    const draft = {
      name: 'deploy-docs',
      purpose: 'Publish the docs site',
      triggers: 'when asked to deploy the docs',
    }
    const prompt = skillDraftPrompt({ ...draft, linkClaude: false })
    assert.match(prompt, /\.agents\/skills\/deploy-docs\/SKILL\.md/)
    assert.match(prompt, /Publish the docs site/)
    assert.match(prompt, /when asked to deploy the docs/)
    assert.match(prompt, /`name` .* and `description`/)
    assert.match(prompt, /done-when/)
    assert.doesNotMatch(prompt, /symlink/)
    assert.match(
      skillDraftPrompt({ ...draft, linkClaude: true }),
      /\.claude\/skills as a symlink to \.\.\/\.agents\/skills/,
    )
  })

  test('the improve prompt asks for only the improved text and no edits', () => {
    for (const kind of ['skill', 'step'] as const) {
      const prompt = improvePrompt(kind, 'Fix the bug')
      assert.match(prompt, /Answer with only the improved text/)
      assert.match(prompt, /Edit no files/)
      assert.ok(prompt.endsWith('Fix the bug'))
    }
    assert.match(improvePrompt('skill', 'x'), /Frontmatter/)
    assert.doesNotMatch(improvePrompt('step', 'x'), /Frontmatter/)
  })
})

describe('workflows', () => {
  const workflow = (name: string): Workflow => ({
    name,
    description: 'Review then fix',
    permissions: 'edit',
    steps: [
      { title: 'Review', agent: null, model: null, prompt: 'Review the diff' },
      {
        title: 'Fix',
        agent: 'opencode',
        model: 'opencode/x-free',
        prompt: 'Fix it',
      },
    ],
  })

  test('saves, lists, renames and deletes, reporting files that do not parse', async () => {
    const root = tempDir()
    assert.deepEqual(listWorkflows(root), { workflows: [], problems: [] })
    const saved = await saveWorkflow(root, workflow('review'))
    assert.deepEqual(saved, {
      ok: true,
      message: 'Saved .agents/workflows/review.json',
      log: null,
    })
    const dir = join(root, '.agents', 'workflows')
    assert.deepEqual(
      JSON.parse(readFileSync(join(dir, 'review.json'), 'utf8')),
      workflow('review'),
    )
    writeFileSync(join(dir, 'broken.json'), '{ nope')
    writeJson(join(dir, 'misnamed.json'), workflow('other'))
    writeJson(join(dir, 'empty.json'), { ...workflow('empty'), steps: [] })
    writeFileSync(join(dir, 'notes.txt'), 'ignored')
    const list = listWorkflows(root)
    assert.deepEqual(list.workflows, [workflow('review')])
    assert.deepEqual(
      list.problems.map(({ file }) => file),
      [
        '.agents/workflows/broken.json',
        '.agents/workflows/empty.json',
        '.agents/workflows/misnamed.json',
      ],
    )
    assert.match(list.problems[2].problem, /its name is other/)

    const renamed = await saveWorkflow(root, workflow('triage'), 'review')
    assert.equal(renamed.ok, true)
    assert.match(renamed.message, /renamed from review/)
    assert.equal(existsSync(join(dir, 'review.json')), false)
    assert.equal(existsSync(join(dir, 'triage.json')), true)

    const deleted = await deleteWorkflow(root, 'triage')
    assert.equal(deleted.ok, true)
    assert.equal(existsSync(join(dir, 'triage.json')), false)
  })

  test('refuses a bad name, a name taken, replacing one that is not there, and deleting one that is not', async () => {
    const root = tempDir()
    await saveWorkflow(root, workflow('one'))
    await saveWorkflow(root, workflow('two'))
    const taken = await saveWorkflow(root, workflow('two'))
    assert.deepEqual(taken.ok, false)
    assert.match(taken.message, /two already exists/)
    const onto = await saveWorkflow(root, workflow('two'), 'one')
    assert.match(onto.message, /two already exists/)
    assert.equal((await saveWorkflow(root, workflow('one'), 'one')).ok, true)
    const gone = await saveWorkflow(root, workflow('three'), 'nope')
    assert.match(gone.message, /no workflow nope to replace/)
    const bad = await saveWorkflow(root, workflow('../escape'))
    assert.equal(bad.ok, false)
    assert.equal((await deleteWorkflow(root, '../one')).ok, false)
    assert.match(
      (await deleteWorkflow(root, 'nope')).message,
      /no workflow nope/,
    )
  })

  test('a run fills a step with no agent with the machine default', () => {
    assert.deepEqual(
      workflowRun(workflow('review'), '/src/app-wt1', 'claude'),
      {
        checkout: '/src/app-wt1',
        title: 'review',
        permissions: 'edit',
        steps: [
          {
            agent: 'claude',
            model: null,
            prompt: 'Review the diff',
            title: 'Review',
          },
          {
            agent: 'opencode',
            model: 'opencode/x-free',
            prompt: 'Fix it',
            title: 'Fix',
          },
        ],
      },
    )
    const none = workflowRun(workflow('review'), '/src/app-wt1', null)
    assert.ok('refused' in none)
    assert.match(none.refused, /"Review" names no agent/)
  })
})
