import type { AgendaId, Pools, PlayerId, TileType } from '../types';

// Board size is chosen per game: 2-player games are always the original
// 5x5; 3-4 player games pick between two larger boards so there's more room
// to develop with more players sharing the same city.
export const BOARD_SIZE_2P = 5;
export const BOARD_SIZE_OPTIONS_MULTIPLAYER: number[] = [7, 11];

export const ALL_PLAYER_IDS: PlayerId[] = ['P1', 'P2', 'P3', 'P4'];
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export const STARTING_CASH = 3;

export const BUILD_COST: Record<TileType, number> = {
  residential: 1,
  commercial: 2,
};

// New-build prices escalate as the game goes on: every N new builds (N =
// active player count, of either type, combined) raises the price by
// PRICE_TIER_INCREMENT for both types. Sizing the tier to the player count
// means every price bracket gives each player an equal shot at it regardless
// of turn order, uncapped for the whole game. Stacking costs are unaffected —
// this only targets the pace of new-tile expansion.
export const PRICE_TIER_INCREMENT = 1;

export const STACK_COST: Record<2 | 3, number> = {
  2: 2,
  3: 3,
};

export const INCOME_PER_UNIT: Record<TileType, number> = {
  residential: 1,
  commercial: 2,
};

export const VP_PER_UNIT: Record<TileType, number> = {
  residential: 1,
  commercial: 2,
};

export const MAX_STORIES = 3;

// Pool sizes tuned for the original 5x5 (24 buildable squares) board. Larger
// boards scale these proportionally to buildable-square count so scarcity
// stays meaningful instead of becoming trivially abundant.
export const INITIAL_POOLS: Pools = {
  res2: 8,
  com2: 8,
  res3: 4,
  com3: 4,
};

export function poolsForBoardSize(size: number): Pools {
  const buildable = size * size - 1;
  const baseBuildable = BOARD_SIZE_2P * BOARD_SIZE_2P - 1;
  const scale = buildable / baseBuildable;
  return {
    res2: Math.round(INITIAL_POOLS.res2 * scale),
    com2: Math.round(INITIAL_POOLS.com2 * scale),
    res3: Math.round(INITIAL_POOLS.res3 * scale),
    com3: Math.round(INITIAL_POOLS.com3 * scale),
  };
}

export const ALL_AGENDAS: AgendaId[] = ['landlord', 'cbd', 'lowrise', 'suburbs'];

// Every agenda has exactly one winner (no ties): whoever's highest wins;
// a tie is broken by cash on hand, then by turn order, so someone always
// wins once at least one player qualifies.
export const AGENDA_INFO: Record<AgendaId, { name: string; description: string; vp: number }> = {
  landlord: {
    name: 'Land Lord',
    description: 'Own the most residential units on the board at game end.',
    vp: 3,
  },
  cbd: {
    name: 'Central Business District',
    description:
      'Own the biggest connected cluster of your own orthogonally-adjoining commercial tiles, scored by total commercial units (stories) in that cluster.',
    vp: 3,
  },
  lowrise: {
    name: 'Low Rise',
    description:
      'Own 4 or more single-story tiles (residential or commercial, never stacked) at game end — most among qualifying players wins.',
    vp: 3,
  },
  suburbs: {
    name: 'Suburbs',
    description:
      'Own 3 or more residential units on edge squares (the 16 border squares) at game end — most among qualifying players wins.',
    vp: 2,
  },
};
