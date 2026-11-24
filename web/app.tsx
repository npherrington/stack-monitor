import { useEffect, useState } from 'react'

import {
  errorMessage,
  MODULE_NAMES,
  type ConfigStatus,
  type ModuleName,
} from '../core/types.ts'
import { getJson } from './lib/api.ts'

const MODULE_LABELS: Record<ModuleName, string> = {
  worktrees: 'Worktrees',
  stack: 'Stack',
  agents: 'Agents',
  featureMap: 'Feature map',
}

type View =
  | { state: 'loading' }
  | { state: 'down'; message: string }
  | { state: 'ready'; status: ConfigStatus }

function Config({ status }: { status: ConfigStatus }) {
  return (
    <section className="card">
      <dl className="facts">
        <dt>Repo</dt>
        <dd>
          <code>{status.repo}</code>
        </dd>
        <dt>Config</dt>
        <dd>
          {status.source === null ? (
            'No stack-monitor.json: the defaults apply'
          ) : (
            <code>{status.source}</code>
          )}
        </dd>
      </dl>
      {status.ok ? (
        <ul className="modules">
          {MODULE_NAMES.map((name) => (
            <li key={name} className={status.modules[name] ? 'on' : 'off'}>
              <span className="dot" aria-hidden="true" />
              {MODULE_LABELS[name]}
              <span className="state">
                {status.modules[name] ? 'on' : 'off'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="problem" role="alert">
          {status.problem}
        </p>
      )}
    </section>
  )
}

export function App() {
  const [view, setView] = useState<View>({ state: 'loading' })
  useEffect(() => {
    let current = true
    getJson<ConfigStatus>('/api/config').then(
      (status) => {
        if (current) setView({ state: 'ready', status })
      },
      (error: unknown) => {
        if (current) setView({ state: 'down', message: errorMessage(error) })
      },
    )
    return () => {
      current = false
    }
  }, [])
  return (
    <main className="shell">
      <h1>Stack monitor</h1>
      {view.state === 'loading' && <p className="muted">Reading the config…</p>}
      {view.state === 'down' && (
        <p className="problem" role="alert">
          {view.message}
        </p>
      )}
      {view.state === 'ready' && <Config status={view.status} />}
    </main>
  )
}
