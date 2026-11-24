// Every route answers JSON, a refusal included, so anything else means the monitor isn't there.
export async function getJson<T>(path: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { headers: { Accept: 'application/json' } })
  } catch {
    throw new Error("The monitor isn't answering. Start it with mise run dev.")
  }
  if (!response.ok) throw new Error(`${path} answered ${response.status}`)
  return (await response.json()) as T
}
