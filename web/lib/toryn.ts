// Toryn, the sidebar's shoot-'em-up: the state of a game and one step of it, with no DOM, so
// tests/toryn.test.ts runs it under node. Distances are the field's pixels, times are seconds.

export const FIELD = { width: 100, height: 90 } as const

export const SHIP_SIZE = { width: 7, height: 7 } as const
export const SHIP_CENTRE = { x: 3, y: 3 } as const // its gun's column, and where it explodes
export const BULLET_SIZE = { width: 1, height: 3 } as const
export const SHOT_SIZE = { width: 2, height: 2 } as const
const SHIP_SPEED = 65
const FIRE_EVERY = 0.16
const BULLET_SPEED = 140
const ENEMY_SHOT_SPEED = 45
export const START_LIVES = 3
const HIT_GRACE = 1.6 // seconds the ship blinks, and can't be hit, after a hit

export const ENEMY_KINDS = ['dart', 'saucer', 'brute'] as const
export type EnemyKind = (typeof ENEMY_KINDS)[number]

interface EnemySpec {
  width: number
  height: number
  hp: number
  points: number
  speed: number // down the field
  shoots: boolean
}

export const ENEMIES: Record<EnemyKind, EnemySpec> = {
  dart: { width: 7, height: 5, hp: 1, points: 10, speed: 34, shoots: false },
  saucer: { width: 8, height: 5, hp: 2, points: 25, speed: 14, shoots: true },
  brute: { width: 9, height: 7, hp: 5, points: 60, speed: 9, shoots: true },
}

export type Phase = 'ready' | 'playing' | 'paused' | 'over'

export interface Input {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
}

export interface Point {
  x: number
  y: number
}

export interface Enemy extends Point {
  id: number
  kind: EnemyKind
  hp: number
  age: number
  originX: number // the column it weaves about
  fireIn: number
  flash: number // seconds left showing the hit it just took
}

export interface Spark extends Point {
  age: number
  size: number
}

export interface Star extends Point {
  layer: 0 | 1 | 2 // far to near: slower and dimmer far away
}

export interface TorynState {
  phase: Phase
  ship: Point
  bullets: Point[]
  shots: (Point & { vx: number; vy: number })[]
  enemies: Enemy[]
  sparks: Spark[]
  stars: Star[]
  score: number
  lives: number
  wave: number
  waveLeft: number // enemies still to enter in this wave
  grace: number
  fireIn: number
  spawnIn: number
  time: number
  nextId: number
  seed: number
}

// mulberry32: a small seeded generator, so a test can replay a game.
function random(state: TorynState): number {
  state.seed = (state.seed + 0x6d2b79f5) | 0
  let t = state.seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function waveSize(wave: number): number {
  return 5 + wave * 2
}

export function newGame(seed: number): TorynState {
  const state: TorynState = {
    phase: 'ready',
    ship: {
      x: (FIELD.width - SHIP_SIZE.width) / 2,
      y: FIELD.height - SHIP_SIZE.height - 4,
    },
    bullets: [],
    shots: [],
    enemies: [],
    sparks: [],
    stars: [],
    score: 0,
    lives: START_LIVES,
    wave: 1,
    waveLeft: waveSize(1),
    grace: 0,
    fireIn: 0,
    spawnIn: 1,
    time: 0,
    nextId: 1,
    seed,
  }
  for (let i = 0; i < 28; i++) {
    state.stars.push({
      x: Math.floor(random(state) * FIELD.width),
      y: random(state) * FIELD.height,
      layer: (i % 3) as Star['layer'],
    })
  }
  return state
}

function pickKind(state: TorynState): EnemyKind {
  const roll = random(state)
  if (state.wave >= 3 && roll < 0.12) return 'brute'
  if (state.wave >= 2 && roll < 0.4) return 'saucer'
  return 'dart'
}

function spawn(state: TorynState): void {
  const kind = pickKind(state)
  const spec = ENEMIES[kind]
  const x = 4 + random(state) * (FIELD.width - spec.width - 8)
  state.enemies.push({
    id: state.nextId++,
    kind,
    hp: spec.hp,
    x,
    y: -spec.height,
    age: 0,
    originX: x,
    fireIn: 0.8 + random(state) * 1.6,
    flash: 0,
  })
  state.waveLeft -= 1
  // Faster waves as the game goes on, never quicker than three a second.
  state.spawnIn =
    Math.max(0.33, 1.1 - state.wave * 0.08) * (0.6 + random(state))
}

function burst(state: TorynState, at: Point, count: number): void {
  for (let i = 0; i < count; i++) {
    state.sparks.push({
      x: at.x + (random(state) - 0.5) * 6,
      y: at.y + (random(state) - 0.5) * 6,
      age: -random(state) * 0.15,
      size: 1 + Math.floor(random(state) * 2),
    })
  }
}

function overlaps(
  a: Point,
  aSize: { width: number; height: number },
  b: Point,
  bSize: { width: number; height: number },
): boolean {
  return (
    a.x < b.x + bSize.width &&
    a.x + aSize.width > b.x &&
    a.y < b.y + bSize.height &&
    a.y + aSize.height > b.y
  )
}

// The ship's hitbox is its middle, as is kind in a shooter: a graze isn't a hit.
const SHIP_HITBOX = { x: 2, y: 2, width: 3, height: 4 }

function hitShip(state: TorynState): void {
  burst(
    state,
    { x: state.ship.x + SHIP_CENTRE.x, y: state.ship.y + SHIP_CENTRE.y },
    10,
  )
  state.lives -= 1
  state.grace = HIT_GRACE
  state.shots = []
  if (state.lives <= 0) state.phase = 'over'
}

// Stars and sparks move whatever the phase, so the last explosion plays out after the game ends.
function drift(state: TorynState, dt: number): void {
  for (const star of state.stars) {
    star.y += (6 + star.layer * 9) * dt
    if (star.y >= FIELD.height) {
      star.y -= FIELD.height
      star.x = Math.floor(random(state) * FIELD.width)
    }
  }
  for (const spark of state.sparks) spark.age += dt
  state.sparks = state.sparks.filter((spark) => spark.age < 0.45)
}

// Moves the game on by dt seconds: the ship by the keys held, its auto-fire, the enemies' paths
// and shots, then every hit. Changes the state in place.
export function step(state: TorynState, input: Input, dt: number): void {
  drift(state, dt)
  if (state.phase !== 'playing') return
  state.time += dt

  const { ship } = state
  const dx = Number(input.right) - Number(input.left)
  const dy = Number(input.down) - Number(input.up)
  const norm = dx !== 0 && dy !== 0 ? Math.SQRT1_2 : 1
  ship.x = Math.min(
    Math.max(ship.x + dx * norm * SHIP_SPEED * dt, 0),
    FIELD.width - SHIP_SIZE.width,
  )
  ship.y = Math.min(
    Math.max(ship.y + dy * norm * SHIP_SPEED * dt, 0),
    FIELD.height - SHIP_SIZE.height,
  )

  state.fireIn -= dt
  if (state.fireIn <= 0) {
    state.fireIn += FIRE_EVERY
    state.bullets.push({ x: ship.x + SHIP_CENTRE.x, y: ship.y - 2 })
    if (state.wave >= 4) {
      state.bullets.push({ x: ship.x, y: ship.y + 2 })
      state.bullets.push({ x: ship.x + SHIP_SIZE.width - 1, y: ship.y + 2 })
    }
  }
  for (const bullet of state.bullets) bullet.y -= BULLET_SPEED * dt
  state.bullets = state.bullets.filter(
    (bullet) => bullet.y > -BULLET_SIZE.height,
  )

  state.spawnIn -= dt
  if (state.waveLeft > 0 && state.spawnIn <= 0) spawn(state)
  if (state.waveLeft === 0 && state.enemies.length === 0) {
    state.wave += 1
    state.waveLeft = waveSize(state.wave)
    state.spawnIn = 1.5
  }

  for (const enemy of state.enemies) {
    const spec = ENEMIES[enemy.kind]
    enemy.age += dt
    enemy.flash = Math.max(0, enemy.flash - dt)
    enemy.y += spec.speed * dt
    const weave = enemy.kind === 'dart' ? 10 : 18
    enemy.x = Math.min(
      Math.max(enemy.originX + Math.sin(enemy.age * 2.2) * weave, 0),
      FIELD.width - spec.width,
    )
    if (!spec.shoots || enemy.y < 0) continue
    enemy.fireIn -= dt
    if (enemy.fireIn > 0) continue
    enemy.fireIn = 1.4 + random(state) * 1.8
    const from = { x: enemy.x + spec.width / 2, y: enemy.y + spec.height }
    const toX = ship.x + SHIP_CENTRE.x - from.x
    const toY = ship.y + SHIP_CENTRE.y - from.y
    const length = Math.hypot(toX, toY) || 1
    state.shots.push({
      ...from,
      vx: (toX / length) * ENEMY_SHOT_SPEED,
      vy: (toY / length) * ENEMY_SHOT_SPEED,
    })
  }
  state.enemies = state.enemies.filter((enemy) => enemy.y < FIELD.height)

  for (const shot of state.shots) {
    shot.x += shot.vx * dt
    shot.y += shot.vy * dt
  }
  state.shots = state.shots.filter(
    (shot) =>
      shot.x > -2 &&
      shot.x < FIELD.width &&
      shot.y > -2 &&
      shot.y < FIELD.height,
  )

  // An enemy killed earlier in this step is skipped, so two bullets landing together score once.
  state.bullets = state.bullets.filter((bullet) => {
    const enemy = state.enemies.find(
      (target) =>
        target.hp > 0 &&
        overlaps(bullet, BULLET_SIZE, target, ENEMIES[target.kind]),
    )
    if (enemy === undefined) return true
    enemy.hp -= 1
    enemy.flash = 0.08
    if (enemy.hp > 0) return false
    const spec = ENEMIES[enemy.kind]
    state.score += spec.points
    burst(
      state,
      { x: enemy.x + spec.width / 2, y: enemy.y + spec.height / 2 },
      enemy.kind === 'brute' ? 14 : 7,
    )
    return false
  })
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0)

  if (state.grace > 0) {
    state.grace = Math.max(0, state.grace - dt)
    return
  }
  const hitbox = { x: ship.x + SHIP_HITBOX.x, y: ship.y + SHIP_HITBOX.y }
  const rammed = state.enemies.find((enemy) =>
    overlaps(hitbox, SHIP_HITBOX, enemy, ENEMIES[enemy.kind]),
  )
  if (rammed !== undefined) {
    state.enemies = state.enemies.filter((enemy) => enemy !== rammed)
    hitShip(state)
    return
  }
  if (
    state.shots.some((shot) => overlaps(hitbox, SHIP_HITBOX, shot, SHOT_SIZE))
  )
    hitShip(state)
}
