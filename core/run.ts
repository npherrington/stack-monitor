import { execFile } from 'node:child_process'

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

interface RunOptions {
  cwd?: string
  timeoutMs?: number
  env?: NodeJS.ProcessEnv // the monitor's own by default
}

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024

// Never rejects. A program that's missing, or killed at the timeout, reads as code -1 with the
// reason in stderr, so a caller handles every failure in one place.
export function run(
  program: string,
  args: string[],
  { cwd, timeoutMs = DEFAULT_TIMEOUT_MS, env }: RunOptions = {},
): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      program,
      args,
      {
        cwd,
        env,
        timeout: timeoutMs,
        maxBuffer: MAX_OUTPUT_BYTES,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ code: 0, stdout, stderr })
          return
        }
        const code = typeof error.code === 'number' ? error.code : -1
        resolve({ code, stdout, stderr: stderr || error.message })
      },
    )
  })
}
