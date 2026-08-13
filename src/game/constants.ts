import type { AgendaId, SetupStepDef, TileType } from '../types';

export const BOARD_SIZE = 5;
export const TOWN_HALL_ROW = 2;
export const TOWN_HALL_COL = 2;

export const STARTING_CASH = 3;

export const BUILD_COST: Record<TileType, number> = {
  residential: 1,
  commercial: 2,
};

// New-build prices escalate as the game goes on: every PRICE_TIER_BUILDS new
// builds (of either type, combined) raises the price by PRICE_TIER_INCREMENT
// for both types. Sized to the player count so every price tier gives each
// player an equal shot at it, uncapped for the whole game. Stacking costs are
// unaffected — this only targets the pace of new-tile expansion.
export const PRICE_TIER_BUILDS = 2;
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

export const INITIAL_POOLS = {
  res2: 8,
  com2: 8,
  res3: 4,
  com3: 4,
};

export const SETUP_SEQUENCE: SetupStepDef[] = [
  { player: 'P1', rule: 'townhall' },
  { player: 'P2', rule: 'townhall' },
  { player: 'P1', rule: 'ownOrTownHall' },
  { player: 'P2', rule: 'ownOrTownHall' },
];

export const ALL_AGENDAS: AgendaId[] = ['landlord', 'cbd', 'lowrise', 'suburbs'];

export const AGENDA_INFO: Record<AgendaId, { name: string; description: string; vp: number }> = {
  landlord: {
    name: 'Land Lord',
    description: 'Own the most residential units on the board at game end. Tied for most = no bonus.',
    vp: 3,
  },
  cbd: {
    name: 'Central Business District',
    description:
      'Own the largest connected group of your own orthogonally-adjoining commercial tiles, including at least two tiles in that group at 2+ stories.',
    vp: 3,
  },
  lowrise: {
    name: 'Low Rise',
    description: 'Own 4 or more single-story tiles (residential or commercial, never stacked) at game end.',
    vp: 3,
  },
  suburbs: {
    name: 'Suburbs',
    description: 'Own 3 or more residential units on edge squares (the 16 border squares) at game end.',
    vp: 2,
  },
};
