import type {
  ActionResult,
  StartedSession,
  TerminalSession,
} from '../../core/types.ts'

// A non-2xx answer. message is the server's copy for a person; status and log are for the code
// and the log link.
export class ApiError extends Error {
  readonly status: number
  readonly log: string | null

  constructor(status: number, message: string, log: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.log = log
  }
}

function isActionResult(body: unknown): body is ActionResult {
  return (
    typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof body.message === 'string'
  )
}

// Every route answers JSON, a refusal included, so anything else means the monitor isn't there.
export async function getJson<T>(path: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { headers: { Accept: 'application/json' } })
  } catch {
    throw new Error("The monitor isn't answering. Start it with mise run dev.")
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    console.error(`${path} answered ${response.status}`)
    throw isActionResult(body)
      ? new ApiError(response.status, body.message, body.log)
      : new ApiError(response.status, `${path} answered ${response.status}`)
  }
  return body as T
}

// A relative path sends the page's own Origin, which the server checks on every POST.
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error("The monitor isn't answering. Start it with mise run dev.")
  }
  const answer: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    console.error(`${path} answered ${response.status}`)
    throw isActionResult(answer)
      ? new ApiError(response.status, answer.message, answer.log)
      : new ApiError(response.status, `${path} answered ${response.status}`)
  }
  return answer as T
}

// An action's refusal (ok: false) fails the call, so a mutation's onError sees it.
export async function postAction(
  path: string,
  body: unknown,
): Promise<ActionResult> {
  const result = await postJson<ActionResult>(path, body)
  if (!result.ok) throw new ApiError(200, result.message, result.log)
  return result
}

// A session launch answers the session it opened; a refusal fails the call, as an action's does.
export async function postSession(
  path: string,
  body: unknown,
): Promise<StartedSession & { session: TerminalSession }> {
  const result = await postJson<StartedSession>(path, body)
  if (!result.ok || result.session === null) {
    throw new ApiError(200, result.message, result.log)
  }
  return { ...result, session: result.session }
}
