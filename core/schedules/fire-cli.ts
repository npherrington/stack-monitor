// What a schedule's LaunchAgent runs: node core/schedules/fire-cli.ts <id>. Its output goes to the
// job's log under the schedules directory.
import { settingsPath } from '../settings.ts'
import { fireSchedule } from './fire.ts'
import { readSchedules, schedulesDir } from './store.ts'

const id = process.argv[2] ?? ''
const dir = schedulesDir()
const settings = settingsPath()
const list = readSchedules(dir)
const schedule =
  'problem' in list ? undefined : list.find((each) => each.id === id)
// The seed only counts when the settings file has never been written; the checkout stands in.
const seed = schedule?.checkout ?? process.cwd()
const fire = await fireSchedule({ settings, seed }, id, 'launchd', {
  schedules: dir,
})
process.stdout.write(
  `${new Date().toISOString()} ${id}: ${
    fire === null
      ? 'nothing to fire'
      : fire.ok
        ? `started run ${fire.runId}`
        : `didn't start: ${fire.message}`
  }\n`,
)
