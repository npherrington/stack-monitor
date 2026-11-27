import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  ENEMIES,
  ENEMY_KINDS,
  FIELD,
  SHIP_SIZE,
  newGame,
  step,
  type Enemy,
  type Input,
  type TorynState,
} from '../web/lib/toryn.ts'
import { spriteSize } from '../web/lib/toryn-draw.ts'

const still: Input = { up: false, down: false, left: false, right: false }

// A game under way with no enemies coming but the ones a test places.
function playing(): TorynState {
  const state = newGame(42)
  state.phase = 'playing'
  state.spawnIn = Infinity
  return state
}

function run(state: TorynState, input: Input, seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) step(state, input, 1 / 60)
}

function dart(state: TorynState, x: number, y: number): Enemy {
  const enemy: Enemy = {
    id: state.nextId++,
    kind: 'dart',
    hp: 1,
    x,
    y,
    age: 0,
    originX: x,
    fireIn: 99,
    flash: 0,
  }
  state.enemies.push(enemy)
  return enemy
}

describe('Toryn', () => {
  test('each sprite is the size of its hitbox', () => {
    for (const kind of ENEMY_KINDS) {
      const { width, height } = ENEMIES[kind]
      assert.deepEqual(spriteSize(kind), { width, height }, kind)
    }
  })

  test('only stars move until the game is playing', () => {
    const state = newGame(1)
    const stars = state.stars.map((star) => star.y)
    run(state, { ...still, left: true }, 1)
    assert.equal(state.bullets.length, 0)
    assert.equal(state.enemies.length, 0)
    assert.equal(state.ship.x, (FIELD.width - SHIP_SIZE.width) / 2)
    assert.notDeepEqual(
      state.stars.map((star) => star.y),
      stars,
    )
  })

  test('the ship fires by itself and stays inside the field', () => {
    const state = playing()
    run(state, { ...still, left: true, up: true }, 3)
    assert.deepEqual(state.ship, { x: 0, y: 0 })
    run(state, { ...still, right: true, down: true }, 3)
    assert.deepEqual(state.ship, {
      x: FIELD.width - SHIP_SIZE.width,
      y: FIELD.height - SHIP_SIZE.height,
    })
    assert.ok(state.bullets.length > 0)
  })

  test('a bullet that meets an enemy scores it', () => {
    const state = playing()
    state.waveLeft = 0
    state.fireIn = 99
    const target = dart(state, 40, 20)
    state.bullets.push({ x: target.x + 3, y: target.y + 2 })
    step(state, still, 1 / 60)
    assert.equal(state.score, ENEMIES.dart.points)
    assert.equal(state.bullets.length, 0, 'the bullet is spent')
    step(state, still, 1 / 60)
    assert.equal(state.wave, 2) // the wave was that one enemy
  })

  test('two bullets landing on one kill score it once', () => {
    const state = playing()
    state.fireIn = 99
    const target = dart(state, 40, 20)
    state.bullets.push({ x: target.x + 1, y: target.y + 2 })
    state.bullets.push({ x: target.x + 5, y: target.y + 2 })
    step(state, still, 1 / 60)
    assert.equal(state.score, ENEMIES.dart.points)
    assert.equal(state.enemies.length, 0)
    assert.equal(state.bullets.length, 1, 'the second bullet flies on')
  })

  test('from wave 4 the ship fires three at a time', () => {
    const state = playing()
    step(state, still, 1 / 60)
    assert.equal(state.bullets.length, 1)
    const later = playing()
    later.wave = 4
    step(later, still, 1 / 60)
    assert.equal(later.bullets.length, 3)
  })

  test('a hit costs a life, then the ship is safe for a moment', () => {
    const state = playing()
    state.fireIn = 99 // hold fire so the darts reach the ship
    dart(state, state.ship.x, state.ship.y)
    step(state, still, 1 / 60)
    assert.equal(state.lives, 2)
    assert.ok(state.grace > 0)
    dart(state, state.ship.x, state.ship.y)
    step(state, still, 1 / 60)
    assert.equal(state.lives, 2, 'a hit during the grace period is ignored')
  })

  test('the game ends when the last life goes', () => {
    const state = playing()
    state.lives = 1
    state.fireIn = 99
    dart(state, state.ship.x, state.ship.y)
    step(state, still, 1 / 60)
    assert.equal(state.phase, 'over')
    const { score } = state
    run(state, still, 1)
    assert.equal(state.score, score)
  })
})
