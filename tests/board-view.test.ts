import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { BoardColumn, Priority, TicketSummary } from '../core/types.ts'
import { BranchName } from '../core/fields.ts'
import { ticketBranch } from '../web/lib/board-branch.ts'
import { matchesTicket, NO_FILTERS } from '../web/lib/board-filter.ts'
import { dropFor, stepFor } from '../web/lib/board-order.ts'

function card(
  id: number,
  column: number,
  more: Partial<TicketSummary> = {},
): TicketSummary {
  return {
    id,
    number: id,
    key: `BEANS-${id}`,
    title: `Ticket ${id}`,
    column,
    priority: 'none',
    dueOn: null,
    overdue: false,
    labels: [],
    commentCount: 0,
    ...more,
  }
}

function lane(id: number, tickets: number[]): BoardColumn {
  return {
    id,
    name: `Column ${id}`,
    colour: null,
    tickets: tickets.map((ticket) => card(ticket, id)),
  }
}

// Backlog holds 1, 2, 3 top to bottom; Todo holds 4; Done is empty.
const BOARD = [lane(10, [1, 2, 3]), lane(20, [4]), lane(30, [])]

describe('where a card lands', () => {
  test('a card dropped on the top or bottom half of another lands before or after it', () => {
    assert.deepEqual(
      dropFor(BOARD, 1, { column: 10, ticket: 3, place: 'after' }),
      { column: 10, beside: 3, place: 'after' },
    )
    assert.deepEqual(
      dropFor(BOARD, 3, { column: 10, ticket: 1, place: 'before' }),
      { column: 10, beside: 1, place: 'before' },
    )
    assert.deepEqual(
      dropFor(BOARD, 1, { column: 20, ticket: 4, place: 'before' }),
      { column: 20, beside: 4, place: 'before' },
    )
  })

  test("a drop on a lane's empty space lands after its last shown card, or on top of an empty lane", () => {
    assert.deepEqual(
      dropFor(BOARD, 1, { column: 20, ticket: null, place: 'after' }),
      { column: 20, beside: 4, place: 'after' },
    )
    assert.deepEqual(
      dropFor(BOARD, 1, { column: 30, ticket: null, place: 'after' }),
      { column: 30, beside: null, place: 'before' },
    )
    assert.deepEqual(
      dropFor(BOARD, 1, { column: 10, ticket: null, place: 'after' }),
      { column: 10, beside: 3, place: 'after' },
    )
  })

  test('a drop where the card already is, is no move', () => {
    for (const over of [
      { column: 10, ticket: 2, place: 'before' }, // onto itself
      { column: 10, ticket: 1, place: 'after' }, // after the card above
      { column: 10, ticket: 3, place: 'before' }, // before the card below
      { column: 99, ticket: null, place: 'after' }, // no such lane
    ] as const) {
      assert.equal(dropFor(BOARD, 2, over), null, JSON.stringify(over))
    }
    // The last card over its own lane's empty space, and a lane's only card.
    assert.equal(
      dropFor(BOARD, 3, { column: 10, ticket: null, place: 'after' }),
      null,
    )
    assert.equal(
      dropFor(BOARD, 4, { column: 20, ticket: null, place: 'after' }),
      null,
    )
  })

  test('a step moves one place among the cards shown and stops at the ends', () => {
    const { tickets } = BOARD[0]
    assert.deepEqual(stepFor(tickets, 2, -1), {
      column: 10,
      beside: 1,
      place: 'before',
    })
    assert.deepEqual(stepFor(tickets, 2, 1), {
      column: 10,
      beside: 3,
      place: 'after',
    })
    assert.equal(stepFor(tickets, 1, -1), null)
    assert.equal(stepFor(tickets, 3, 1), null)
    assert.equal(stepFor(tickets, 99, 1), null)
  })
})

describe('what the filters show', () => {
  const bug = { id: 1, name: 'bug', colour: null }
  const api = { id: 2, name: 'api', colour: null }
  const roast = card(12, 10, {
    title: 'Roast the beans',
    priority: 'high',
    labels: [bug],
  })
  const shows = (
    search: string,
    labels: number[] = [],
    priorities: Priority[] = [],
  ) => matchesTicket(roast, { search, labels, priorities })

  test('the search matches the title or the id, whatever the case', () => {
    assert.equal(matchesTicket(roast, NO_FILTERS), true)
    for (const search of ['roast', ' BEANS ', 'beans-12', 'BEANS-12', '12']) {
      assert.equal(shows(search), true, search)
    }
    for (const search of ['grind', 'BEANS-13', '120']) {
      assert.equal(shows(search), false, search)
    }
  })

  test('labels match any picked, priorities any picked, and the three narrow together', () => {
    assert.equal(shows('', [bug.id, api.id]), true)
    assert.equal(shows('', [api.id]), false)
    assert.equal(shows('', [], ['urgent', 'high']), true)
    assert.equal(shows('', [], ['low']), false)
    assert.equal(shows('roast', [bug.id], ['high']), true)
    assert.equal(shows('roast', [bug.id], ['low']), false)
    assert.equal(shows('grind', [bug.id], ['high']), false)
  })
})

describe("a ticket's branch", () => {
  test("a ticket's branch is its key and a slug of its title, and passes BranchName", () => {
    for (const [title, branch] of [
      ['Add a dark theme', 'beans-3-add-a-dark-theme'],
      [
        "Don't lose the user's draft (again)!",
        'beans-3-don-t-lose-the-user-s-draft-again',
      ],
      ['  --force; rm -rf $HOME  ', 'beans-3-force-rm-rf-home'],
      ['テーマを追加', 'beans-3'],
      [
        'Rework the checkout page so the address form validates before the payment step loads',
        'beans-3-rework-the-checkout-page-so-the-address-form',
      ],
    ] as const) {
      assert.equal(ticketBranch('BEANS-3', title), branch)
      assert.equal(BranchName.safeParse(branch).success, true, branch)
      assert.ok(branch.length <= 60, branch)
    }
  })
})
