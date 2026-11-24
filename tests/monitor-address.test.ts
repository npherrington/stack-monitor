import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readMonitorPort } from '../core/monitor-address.ts'

test('STACK_MONITOR_PORT: unset is the default, digits in range are taken', () => {
  assert.deepEqual(readMonitorPort(undefined), { port: 7420 })
  assert.deepEqual(readMonitorPort(''), { port: 7420 })
  assert.deepEqual(readMonitorPort('7421'), { port: 7421 })
})

test('STACK_MONITOR_PORT: anything but a user port is refused', () => {
  for (const raw of ['80', '65536', '1e4', '0x1F90', ' 7420', 'abc']) {
    assert.deepEqual(readMonitorPort(raw), {
      error: `STACK_MONITOR_PORT=${raw} isn't a port from 1024 to 65535.`,
    })
  }
})
