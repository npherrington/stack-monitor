// Stand-ins for the agent CLIs: shell scripts that print canned output in each CLI's format, so a
// run goes end to end without a model. What they do is picked by words in the prompt, their last
// argument: FAIL-NOW exits 1, HANG-NOW waits for SIGTERM, SECOND-STEP reports "second done", anything else reports and exits 0.
import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function script(path: string, body: string): string {
  writeFileSync(path, `#!/bin/sh\n${body}`)
  chmodSync(path, 0o755)
  return path
}

// Claude Code's stream-json. The text names the cwd and FAKE_ENV, so a test can see where the step
// ran and what it was given.
export function fakeClaude(dir: string): string {
  return script(
    join(dir, 'fake-claude'),
    String.raw`for last; do :; done
if [ "$1" = "--version" ]; then echo "9.9.9 (Fake Code)"; exit 0; fi
echo '{"type":"system","subtype":"init","session_id":"sess-claude","model":"fake"}'
echo 'not json, from the CLI'
printf '{"type":"assistant","message":{"content":[{"type":"text","text":"cwd=%s env=%s"},{"type":"tool_use","name":"Read","input":{"file_path":"README"}}]}}\n' "$(pwd)" "$FAKE_ENV"
case "$last" in
  *FAIL-NOW*)
    echo "it broke" >&2
    echo '{"type":"result","subtype":"error_during_execution","is_error":true,"result":"it broke","session_id":"sess-claude","total_cost_usd":0.01}'
    exit 1 ;;
  *HANG-NOW*)
    trap 'echo "got TERM" >&2; exit 143' TERM
    sleep 30 &
    wait $!
    exit 0 ;;
  *SECOND-STEP*)
    echo '{"type":"result","subtype":"success","is_error":false,"result":"second done","session_id":"sess-two","total_cost_usd":0.5}' ;;
  *)
    echo '{"type":"result","subtype":"success","is_error":false,"result":"first done","session_id":"sess-claude","total_cost_usd":0.25}' ;;
esac
`,
  )
}

// OpenCode's json events, and its models list with the designer's free model in it. It writes the
// permission config it was given to stderr.
export function fakeOpencode(dir: string): string {
  return script(
    join(dir, 'fake-opencode'),
    String.raw`if [ "$1" = "--version" ]; then echo "opencode v0.0.1"; exit 0; fi
if [ "$1" = "models" ]; then
  echo "ollama/tiny:1b"
  echo "opencode/other-free"
  echo "opencode/deepseek-v4.1-flash-free"
  exit 0
fi
echo "config=$OPENCODE_CONFIG_CONTENT" >&2
echo '{"type":"step_start","sessionID":"ses_fake","part":{"type":"step-start"}}'
echo '{"type":"text","sessionID":"ses_fake","part":{"type":"text","text":"drafted it"}}'
echo '{"type":"step_finish","sessionID":"ses_fake","part":{"type":"step-finish","reason":"stop","cost":0}}'
`,
  )
}

// Stands in for an interactive `claude`: prints each argument it was started with on a line of its
// own (a multi-line one runs on), then answers each line it's sent.
export function fakeSessionClaude(dir: string): string {
  return script(
    join(dir, 'fake-session-claude'),
    String.raw`echo "cwd=$(pwd)"
for arg; do printf 'arg:%s\n' "$arg"; done
echo "ready"
while read line; do echo "got:$line"; done
`,
  )
}
