import { describe, expect, it } from 'vitest';
import type { BuiltTile, Cell, GameState, PlayerId } from '../types';
import {
  applyBuild,
  applyPass,
  applyStack,
  createInitialState,
  currentBuildCost,
  currentBuildPriceTier,
  currentStackCost,
  evaluateAllAgendas,
  legalBuildActions,
  playerState,
  residentialCapacitySurplus,
  residentialRentMultiplier,
  scoreGame,
  upkeepCost,
} from './engine';
import { FREE_UPKEEP_STORIES, STARTING_CASH } from './constants';

// ---------- fixtures ----------

function makeBoard(size: number, withTownHall = true): Cell[][] {
  const board: Cell[][] = Array.from({ length: size }, () => Array<Cell>(size).fill(null));
  if (withTownHall) {
    const th = Math.floor(size / 2);
    board[th][th] = 'townhall';
  }
  return board;
}

function tile(type: BuiltTile['type'], owner: PlayerId, stories: BuiltTile['stories']): BuiltTile {
  return { type, owner, stories };
}

// A minimal but valid two-player GameState, deterministic turn order (unlike
// createInitialState, which shuffles playerOrder randomly — not suitable for
// tests that need a predictable currentPlayer).
function makeState(overrides: Partial<GameState> = {}): GameState {
  const board = overrides.board ?? makeBoard(5);
  return {
    playerOrder: ['P1', 'P2'],
    phase: 'playing',
    board,
    players: {
      P1: { cash: STARTING_CASH, kind: 'ai', label: 'P1' },
      P2: { cash: STARTING_CASH, kind: 'ai', label: 'P2' },
    },
    pools: { res2: 8, com2: 8, res3: 4, com3: 4 },
    currentPlayer: 'P1',
    passStreak: 0,
    turnNumber: 1,
    buildsExecuted: 0,
    log: [],
    ...overrides,
  };
}

// ---------- build/stack price escalation ----------

describe('build price escalation', () => {
  it('starts at the base price with no builds executed', () => {
    const state = makeState({ buildsExecuted: 0 });
    expect(currentBuildPriceTier(state)).toBe(0);
    expect(currentBuildCost(state, 'residential')).toBe(1);
    expect(currentBuildCost(state, 'commercial')).toBe(2);
    expect(currentBuildCost(state, 'park')).toBe(3);
  });

  it('rises by $1M for all three types every priceTierBuilds builds', () => {
    // 5x5, 2 players -> priceTierBuilds = 2.
    const state = makeState({ buildsExecuted: 2 });
    expect(currentBuildPriceTier(state)).toBe(1);
    expect(currentBuildCost(state, 'residential')).toBe(2);
    expect(currentBuildCost(state, 'commercial')).toBe(3);
    expect(currentBuildCost(state, 'park')).toBe(4);
  });

  it('scales the tier size with board size, so a larger board escalates slower per-build', () => {
    const state7 = makeState({ board: makeBoard(7), buildsExecuted: 2 });
    // 7x7, 2 players -> boardScale(7) = 48/24 = 2 -> priceTierBuilds = 4, so 2 builds isn't a full tier yet.
    expect(currentBuildPriceTier(state7)).toBe(0);
    expect(currentBuildCost(state7, 'residential')).toBe(1);
  });
});

describe('stack price escalation', () => {
  it('2nd floor always stays flat at the base price, no matter how high the tier climbs', () => {
    const lowTier = makeState({ buildsExecuted: 0 });
    const highTier = makeState({ buildsExecuted: 100 });
    expect(currentStackCost(lowTier, 2)).toBe(2);
    expect(currentStackCost(highTier, 2)).toBe(2);
  });

  it('3rd floor rides the same escalating tier new builds use', () => {
    const state = makeState({ buildsExecuted: 2 }); // tier 1 on a 5x5/2p game
    expect(currentStackCost(state, 3)).toBe(4); // base 3 + tier(1) * increment(1)
  });
});

// ---------- upkeep ----------

describe('upkeepCost', () => {
  it('charges nothing within the free-story allowance', () => {
    const board = makeBoard(5);
    board[0][0] = tile('residential', 'P1', 1);
    board[0][1] = tile('residential', 'P1', 1);
    expect(FREE_UPKEEP_STORIES).toBe(4);
    expect(upkeepCost(board, 'P1')).toBe(0); // 2 total stories, allowance is 4
  });

  it('charges $1M per story beyond the free allowance', () => {
    const board = makeBoard(5);
    board[0][0] = tile('commercial', 'P1', 3);
    board[0][1] = tile('residential', 'P1', 2);
    // 5 total stories, 1 over the 4-story allowance.
    expect(upkeepCost(board, 'P1')).toBe(1);
  });

  it('closes the old tile-count loophole: a single tile maxed to 3 stories is not free just for being one tile', () => {
    const board = makeBoard(5);
    board[0][0] = tile('residential', 'P1', 3);
    // Previously a tile-count-based allowance (e.g. "first 2 tiles free")
    // would have let this dodge upkeep entirely. Per-story upkeep means it
    // doesn't matter how few tiles the stories are spread across.
    expect(upkeepCost(board, 'P1')).toBe(0); // 3 stories, still within the 4-story allowance
    board[0][1] = tile('residential', 'P1', 2);
    expect(upkeepCost(board, 'P1')).toBe(1); // 5 total stories now, 1 over
  });

  it('only counts stories owned by the player in question', () => {
    const board = makeBoard(5);
    board[0][0] = tile('residential', 'P1', 3);
    board[0][1] = tile('commercial', 'P2', 3);
    expect(upkeepCost(board, 'P1')).toBe(0);
    expect(upkeepCost(board, 'P2')).toBe(0);
  });
});

// ---------- residential capacity ----------

describe('residentialCapacitySurplus', () => {
  it('is zero for a single unstacked residential tile (self-covering)', () => {
    const board = makeBoard(5);
    board[0][0] = tile('residential', 'P1', 1);
    expect(residentialCapacitySurplus(board, 'P1')).toBe(0);
  });

  it('stays zero when adding more unstacked residential tiles — only stacking creates surplus', () => {
    const board = makeBoard(5);
    board[0][0] = tile('residential', 'P1', 1);
    board[0][1] = tile('residential', 'P1', 1);
    board[0][2] = tile('residential', 'P1', 1);
    expect(residentialCapacitySurplus(board, 'P1')).toBe(0);
  });

  it('increases by 1 for every story a residential tile is stacked beyond its first', () => {
    const board = makeBoard(5);
    board[0][0] = tile('residential', 'P1', 3);
    expect(residentialCapacitySurplus(board, 'P1')).toBe(2);
  });

  it('gates commercial/park builds until there is spare capacity', () => {
    const board = makeBoard(5);
    board[0][0] = tile('residential', 'P1', 1);
    const state = makeState({ board });
    const builds = legalBuildActions(state, 'P1');
    expect(builds.some((b) => b.tileType === 'residential')).toBe(true);
    expect(builds.some((b) => b.tileType === 'commercial')).toBe(false);
    expect(builds.some((b) => b.tileType === 'park')).toBe(false);
  });
});

// ---------- adjacency rent modifiers ----------

describe('residentialRentMultiplier', () => {
  it('is 1x with no adjacent park or commercial', () => {
    const board = makeBoard(5);
    board[0][0] = tile('residential', 'P1', 1);
    expect(residentialRentMultiplier(board, 0, 0)).toBe(1);
  });

  it('doubles for an adjacent park', () => {
    const board = makeBoard(5);
    board[0][0] = tile('residential', 'P1', 1);
    board[0][1] = tile('park', 'P2', 1);
    expect(residentialRentMultiplier(board, 0, 0)).toBe(2);
  });

  it('halves for an adjacent commercial tile', () => {
    const board = makeBoard(5);
    board[0][0] = tile('residential', 'P1', 1);
    board[0][1] = tile('commercial', 'P2', 1);
    expect(residentialRentMultiplier(board, 0, 0)).toBe(0.5);
  });

  it('stacks multiplicatively across multiple adjacent parks', () => {
    const board = makeBoard(5);
    board[1][1] = tile('residential', 'P1', 1);
    board[0][1] = tile('park', 'P2', 1);
    board[2][1] = tile('park', 'P2', 1);
    expect(residentialRentMultiplier(board, 1, 1)).toBe(4);
  });

  it('cancels out when both a park and a commercial neighbor are present', () => {
    const board = makeBoard(5);
    board[1][1] = tile('residential', 'P1', 1);
    board[0][1] = tile('park', 'P2', 1);
    board[2][1] = tile('commercial', 'P2', 1);
    expect(residentialRentMultiplier(board, 1, 1)).toBe(1);
  });

  it('applies regardless of who owns the neighboring tile', () => {
    const board = makeBoard(5);
    board[0][0] = tile('residential', 'P1', 1);
    board[0][1] = tile('park', 'P1', 1); // same owner as the residential tile
    expect(residentialRentMultiplier(board, 0, 0)).toBe(2);
  });
});

// ---------- agendas ----------

describe('agendas', () => {
  it('Suburbs counts only single-story (unstacked) residential tiles on edge squares', () => {
    const board = makeBoard(5);
    board[0][0] = tile('residential', 'P1', 1);
    board[0][1] = tile('residential', 'P1', 1);
    board[0][2] = tile('residential', 'P1', 1);
    const state = makeState({ board });
    const suburbs = evaluateAllAgendas(state, 'P1').find((r) => r.agenda === 'suburbs')!;
    expect(suburbs.met).toBe(true);

    // Stacking one of those edge tiles removes it from the count (drops below the 3-tile floor).
    (board[0][0] as BuiltTile).stories = 2;
    const suburbsAfterStack = evaluateAllAgendas(state, 'P1').find((r) => r.agenda === 'suburbs')!;
    expect(suburbsAfterStack.met).toBe(false);
  });

  it('Central Business District scores by total commercial units (stories) in the largest connected cluster', () => {
    const board = makeBoard(5);
    board[0][0] = tile('commercial', 'P1', 3);
    board[0][1] = tile('commercial', 'P1', 2);
    // Disconnected single commercial tile for P1 elsewhere — shouldn't add to the cluster.
    board[4][4] = tile('commercial', 'P1', 1);
    const state = makeState({ board });
    const cbd = evaluateAllAgendas(state, 'P1').find((r) => r.agenda === 'cbd')!;
    expect(cbd.detail).toContain('5 units'); // 3 + 2 from the connected pair, not +1 from the isolated tile
  });

  it('Low Rise requires 4+ single-story tiles and goes to whoever has the most among qualifiers', () => {
    const board = makeBoard(5);
    board[0][0] = tile('residential', 'P1', 1);
    board[0][1] = tile('residential', 'P1', 1);
    board[0][2] = tile('residential', 'P1', 1);
    const state = makeState({ board });
    // Only 3 single-story tiles -- doesn't clear the 4-tile floor.
    expect(evaluateAllAgendas(state, 'P1').find((r) => r.agenda === 'lowrise')!.met).toBe(false);

    board[0][3] = tile('residential', 'P1', 1);
    const metState = makeState({ board });
    expect(evaluateAllAgendas(metState, 'P1').find((r) => r.agenda === 'lowrise')!.met).toBe(true);
  });

  it('Land Lord goes to whoever owns the most residential units, no minimum', () => {
    const board = makeBoard(5);
    board[0][0] = tile('residential', 'P1', 2);
    board[0][1] = tile('residential', 'P2', 1);
    const state = makeState({ board });
    expect(evaluateAllAgendas(state, 'P1').find((r) => r.agenda === 'landlord')!.met).toBe(true);
    expect(evaluateAllAgendas(state, 'P2').find((r) => r.agenda === 'landlord')!.met).toBe(false);
  });

  it('Urban Jungle scores by the largest connected cluster of park tiles', () => {
    const board = makeBoard(5);
    board[0][0] = tile('park', 'P1', 1);
    board[0][1] = tile('park', 'P1', 1);
    board[4][4] = tile('park', 'P2', 1);
    const state = makeState({ board });
    expect(evaluateAllAgendas(state, 'P1').find((r) => r.agenda === 'urbanjungle')!.met).toBe(true);
    expect(evaluateAllAgendas(state, 'P2').find((r) => r.agenda === 'urbanjungle')!.met).toBe(false);
  });

  it('a tie for the top spot means nobody scores that agenda', () => {
    const board = makeBoard(5);
    board[0][0] = tile('residential', 'P1', 1);
    board[0][1] = tile('residential', 'P2', 1);
    const state = makeState({ board });
    expect(evaluateAllAgendas(state, 'P1').find((r) => r.agenda === 'landlord')!.met).toBe(false);
    expect(evaluateAllAgendas(state, 'P2').find((r) => r.agenda === 'landlord')!.met).toBe(false);
  });
});

// ---------- turn flow ----------

describe('turn flow', () => {
  it('deducts the build cost and collects income only for the acting player', () => {
    const state = makeState();
    const next = applyBuild(state, 0, 0, 'residential');
    // Residential build costs $1M, then collects $1M income from that same tile.
    expect(playerState(next, 'P1').cash).toBe(STARTING_CASH - 1 + 1);
    expect(playerState(next, 'P2').cash).toBe(STARTING_CASH); // untouched on P1's turn
  });

  it('advances to the next player after a build', () => {
    const state = makeState();
    const next = applyBuild(state, 0, 0, 'residential');
    expect(next.currentPlayer).toBe('P2');
  });

  it('resets the pass streak on a build or stack, and increments it on a pass', () => {
    const state = makeState({ passStreak: 1 });
    const afterBuild = applyBuild(state, 0, 0, 'residential');
    expect(afterBuild.passStreak).toBe(0);

    const passState = makeState({ passStreak: 0 });
    const afterPass = applyPass(passState);
    expect(afterPass.passStreak).toBe(1);
  });

  it('ends the game when every active player passes in a row', () => {
    const state = makeState({ passStreak: 1 }); // P1 is about to be the 2nd consecutive pass
    const next = applyPass(state);
    expect(next.phase).toBe('ended');
    expect(next.result).toBeDefined();
  });

  it('ends the game when the board fills completely', () => {
    const board = makeBoard(5);
    // Fill every square except one.
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (board[r][c] === null) board[r][c] = tile('residential', 'P1', 1);
      }
    }
    // Leave exactly one empty square for P1's final build.
    board[4][4] = null;
    const state = makeState({ board, players: { P1: { cash: 999, kind: 'ai', label: 'P1' }, P2: { cash: 999, kind: 'ai', label: 'P2' } } });
    const next = applyBuild(state, 4, 4, 'residential');
    expect(next.phase).toBe('ended');
  });

  it('stacking costs the right amount and raises the tile height', () => {
    const board = makeBoard(5);
    board[0][0] = tile('residential', 'P1', 1);
    const state = makeState({ board, players: { P1: { cash: 10, kind: 'ai', label: 'P1' }, P2: { cash: 10, kind: 'ai', label: 'P2' } } });
    const next = applyStack(state, 0, 0);
    const cell = next.board[0][0] as BuiltTile;
    expect(cell.stories).toBe(2);
    expect(next.pools.res2).toBe(7); // drawn from the shared pool
  });
});

// ---------- createInitialState smoke test ----------

describe('createInitialState', () => {
  it('places a permanent Town Hall at the board center', () => {
    const state = createInitialState([{ kind: 'ai' }, { kind: 'ai' }], 5);
    expect(state.board[2][2]).toBe('townhall');
  });

  it('gives every player the correct starting cash and an empty board otherwise', () => {
    const state = createInitialState([{ kind: 'ai' }, { kind: 'ai' }, { kind: 'human' }], 7);
    for (const p of state.playerOrder) {
      expect(playerState(state, p).cash).toBe(STARTING_CASH);
    }
    let occupied = 0;
    for (const row of state.board) {
      for (const cell of row) {
        if (cell !== null) occupied++;
      }
    }
    expect(occupied).toBe(1); // just the Town Hall -- no free tiles
    expect(state.phase).toBe('playing'); // no setup phase
  });

  it('rejects player counts outside 2-4', () => {
    expect(() => createInitialState([{ kind: 'ai' }], 5)).toThrow();
    expect(() =>
      createInitialState([{ kind: 'ai' }, { kind: 'ai' }, { kind: 'ai' }, { kind: 'ai' }, { kind: 'ai' }], 5),
    ).toThrow();
  });
});

// ---------- scoreGame tiebreak ----------

describe('scoreGame', () => {
  it('breaks a tied total VP by cash on hand', () => {
    const board = makeBoard(5);
    board[0][0] = tile('residential', 'P1', 1);
    board[0][1] = tile('residential', 'P2', 1);
    const state = makeState({
      board,
      players: {
        P1: { cash: 50, kind: 'ai', label: 'P1' },
        P2: { cash: 20, kind: 'ai', label: 'P2' },
      },
    });
    const result = scoreGame(state);
    expect(result.winners).toEqual(['P1']);
    expect(result.reason).toContain('cash');
  });

  it('shares the win when both VP and cash are tied', () => {
    const board = makeBoard(5);
    const state = makeState({ board });
    const result = scoreGame(state);
    expect(result.winners.sort()).toEqual(['P1', 'P2']);
  });
});
