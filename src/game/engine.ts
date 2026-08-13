import type {
  Action,
  AgendaId,
  AgendaResult,
  BuiltTile,
  Cell,
  GameMode,
  GameResult,
  GameState,
  PlayerId,
  PlayerState,
  Pools,
  ScoreBreakdown,
  TileType,
} from '../types';
import {
  AGENDA_INFO,
  ALL_AGENDAS,
  BOARD_SIZE,
  BUILD_COST,
  INCOME_PER_UNIT,
  INITIAL_POOLS,
  MAX_STORIES,
  SETUP_SEQUENCE,
  STACK_COST,
  STARTING_CASH,
  TOWN_HALL_COL,
  TOWN_HALL_ROW,
  VP_PER_UNIT,
} from './constants';

// ---------- helpers ----------

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function otherPlayer(p: PlayerId): PlayerId {
  return p === 'P1' ? 'P2' : 'P1';
}

export function cloneBoard(board: Cell[][]): Cell[][] {
  return board.map((row) => row.map((cell) => (cell && cell !== 'townhall' ? { ...cell } : cell)));
}

export function neighbors(row: number, col: number): Array<[number, number]> {
  const deltas: Array<[number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  return deltas
    .map(([dr, dc]): [number, number] => [row + dr, col + dc])
    .filter(([r, c]) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE);
}

export function isAdjacentToAnyTile(board: Cell[][], row: number, col: number): boolean {
  return neighbors(row, col).some(([r, c]) => board[r][c] !== null);
}

export function isAdjacentToTownHall(row: number, col: number): boolean {
  return neighbors(row, col).some(([r, c]) => r === TOWN_HALL_ROW && c === TOWN_HALL_COL);
}

// ---------- setup ----------

export function createInitialState(mode: GameMode): GameState {
  const board: Cell[][] = Array.from({ length: BOARD_SIZE }, () => Array<Cell>(BOARD_SIZE).fill(null));
  board[TOWN_HALL_ROW][TOWN_HALL_COL] = 'townhall';

  const agendas = shuffle(ALL_AGENDAS).slice(0, 2) as [AgendaId, AgendaId];

  // Coin flip: in hotseat both seats are human, so who is "P1" is cosmetic.
  // In PvC, the coin flip decides whether the human or the AI goes first.
  let p1Kind: 'human' | 'ai' = 'human';
  let p2Kind: 'human' | 'ai' = 'human';
  if (mode === 'pvc') {
    const humanFirst = Math.random() < 0.5;
    p1Kind = humanFirst ? 'human' : 'ai';
    p2Kind = humanFirst ? 'ai' : 'human';
  }

  const players: Record<PlayerId, PlayerState> = {
    P1: {
      cash: STARTING_CASH,
      agenda: agendas[0],
      kind: p1Kind,
      label: mode === 'pvc' ? (p1Kind === 'human' ? 'You' : 'Computer') : 'Player 1',
    },
    P2: {
      cash: STARTING_CASH,
      agenda: agendas[1],
      kind: p2Kind,
      label: mode === 'pvc' ? (p2Kind === 'human' ? 'You' : 'Computer') : 'Player 2',
    },
  };

  const pools: Pools = { ...INITIAL_POOLS };

  return {
    mode,
    phase: 'setup',
    board,
    players,
    pools,
    currentPlayer: 'P1',
    setupStep: 0,
    passStreak: 0,
    turnNumber: 0,
    log: ['Player 1 won the coin flip and places first.'],
  };
}

export function legalSetupSquares(state: GameState): Array<[number, number]> {
  if (state.phase !== 'setup') return [];
  const stepDef = SETUP_SEQUENCE[state.setupStep];
  if (!stepDef) return [];
  const result: Array<[number, number]> = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (state.board[r][c] !== null) continue;
      if (stepDef.rule === 'townhall') {
        if (isAdjacentToTownHall(r, c)) result.push([r, c]);
      } else {
        if (isAdjacentToAnyTile(state.board, r, c)) result.push([r, c]);
      }
    }
  }
  return result;
}

export function placeSetupTile(state: GameState, row: number, col: number): GameState {
  const stepDef = SETUP_SEQUENCE[state.setupStep];
  if (!stepDef) throw new Error('Setup already complete');
  const legal = legalSetupSquares(state);
  if (!legal.some(([r, c]) => r === row && c === col)) {
    throw new Error('Illegal setup placement');
  }

  const board = cloneBoard(state.board);
  const tile: BuiltTile = { type: 'residential', owner: stepDef.player, stories: 1 };
  board[row][col] = tile;

  const nextSetupStep = state.setupStep + 1;
  const label = `${state.players[stepDef.player].label} places a residential tile at (${row + 1}, ${col + 1}).`;

  if (nextSetupStep >= SETUP_SEQUENCE.length) {
    return {
      ...state,
      board,
      setupStep: nextSetupStep,
      phase: 'playing',
      currentPlayer: 'P1',
      turnNumber: 1,
      log: [...state.log, label, 'Setup complete. Player 1 takes the first turn.'],
    };
  }

  return {
    ...state,
    board,
    setupStep: nextSetupStep,
    currentPlayer: SETUP_SEQUENCE[nextSetupStep].player,
    log: [...state.log, label],
  };
}

// ---------- legal actions during play ----------

export function emptyAdjacencyLegalSquares(board: Cell[][]): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === null && isAdjacentToAnyTile(board, r, c)) {
        result.push([r, c]);
      }
    }
  }
  return result;
}

export interface LegalBuild {
  row: number;
  col: number;
  tileType: TileType;
  cost: number;
}

export function legalBuildActions(state: GameState, player: PlayerId): LegalBuild[] {
  const squares = emptyAdjacencyLegalSquares(state.board);
  const cash = state.players[player].cash;
  const result: LegalBuild[] = [];
  for (const [r, c] of squares) {
    (['residential', 'commercial'] as TileType[]).forEach((tileType) => {
      const cost = BUILD_COST[tileType];
      if (cash >= cost) result.push({ row: r, col: c, tileType, cost });
    });
  }
  return result;
}

export interface LegalStack {
  row: number;
  col: number;
  tileType: TileType;
  nextStory: 2 | 3;
  cost: number;
  poolKey: keyof Pools;
}

function poolKeyFor(tileType: TileType, story: 2 | 3): keyof Pools {
  if (tileType === 'residential') return story === 2 ? 'res2' : 'res3';
  return story === 2 ? 'com2' : 'com3';
}

export function legalStackActions(state: GameState, player: PlayerId): LegalStack[] {
  const result: LegalStack[] = [];
  const cash = state.players[player].cash;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = state.board[r][c];
      if (!cell || cell === 'townhall') continue;
      if (cell.owner !== player) continue;
      if (cell.stories >= MAX_STORIES) continue;
      const nextStory = (cell.stories + 1) as 2 | 3;
      const cost = STACK_COST[nextStory];
      const poolKey = poolKeyFor(cell.type, nextStory);
      if (cash >= cost && state.pools[poolKey] > 0) {
        result.push({ row: r, col: c, tileType: cell.type, nextStory, cost, poolKey });
      }
    }
  }
  return result;
}

export function hasAnyLegalAction(state: GameState, player: PlayerId): boolean {
  return legalBuildActions(state, player).length > 0 || legalStackActions(state, player).length > 0;
}

// ---------- applying actions ----------

function collectIncome(state: GameState): GameState {
  const players = { ...state.players };
  (['P1', 'P2'] as PlayerId[]).forEach((p) => {
    let income = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = state.board[r][c];
        if (cell && cell !== 'townhall' && cell.owner === p) {
          income += INCOME_PER_UNIT[cell.type] * cell.stories;
        }
      }
    }
    players[p] = { ...players[p], cash: players[p].cash + income };
  });
  return { ...state, players };
}

function checkGameEnd(state: GameState): GameState {
  const emptySquares = state.board.some((row) => row.some((cell) => cell === null));
  const noStacksEither =
    legalStackActions(state, 'P1').length === 0 && legalStackActions(state, 'P2').length === 0;
  const boardLocked = !emptySquares && noStacksEither;
  const bothPassed = state.passStreak >= 2;

  if (boardLocked || bothPassed) {
    const result = scoreGame(state);
    return { ...state, phase: 'ended', result };
  }
  return state;
}

function advanceTurn(state: GameState): GameState {
  return { ...state, currentPlayer: otherPlayer(state.currentPlayer), turnNumber: state.turnNumber + 1 };
}

export function applyBuild(state: GameState, row: number, col: number, tileType: TileType): GameState {
  const player = state.currentPlayer;
  const legal = legalBuildActions(state, player).some(
    (a) => a.row === row && a.col === col && a.tileType === tileType,
  );
  if (!legal) throw new Error('Illegal build action');

  const board = cloneBoard(state.board);
  const tile: BuiltTile = { type: tileType, owner: player, stories: 1 };
  board[row][col] = tile;

  const players = { ...state.players };
  players[player] = { ...players[player], cash: players[player].cash - BUILD_COST[tileType] };

  let next: GameState = {
    ...state,
    board,
    players,
    passStreak: 0,
    log: [
      ...state.log,
      `${state.players[player].label} builds ${tileType} at (${row + 1}, ${col + 1}).`,
    ],
  };
  next = collectIncome(next);
  next = checkGameEnd(next);
  if (next.phase !== 'ended') next = advanceTurn(next);
  return next;
}

export function applyStack(state: GameState, row: number, col: number): GameState {
  const player = state.currentPlayer;
  const action = legalStackActions(state, player).find((a) => a.row === row && a.col === col);
  if (!action) throw new Error('Illegal stack action');

  const board = cloneBoard(state.board);
  const cell = board[row][col];
  if (!cell || cell === 'townhall') throw new Error('No tile to stack on');
  cell.stories = action.nextStory;

  const players = { ...state.players };
  players[player] = { ...players[player], cash: players[player].cash - action.cost };

  const pools = { ...state.pools, [action.poolKey]: state.pools[action.poolKey] - 1 };

  let next: GameState = {
    ...state,
    board,
    players,
    pools,
    passStreak: 0,
    log: [
      ...state.log,
      `${state.players[player].label} adds a floor (${action.nextStory}${
        action.nextStory === 2 ? 'nd' : 'rd'
      }) to their ${action.tileType} tile at (${row + 1}, ${col + 1}).`,
    ],
  };
  next = collectIncome(next);
  next = checkGameEnd(next);
  if (next.phase !== 'ended') next = advanceTurn(next);
  return next;
}

export function applyPass(state: GameState): GameState {
  const player = state.currentPlayer;
  let next: GameState = {
    ...state,
    passStreak: state.passStreak + 1,
    log: [...state.log, `${state.players[player].label} passes.`],
  };
  next = collectIncome(next);
  next = checkGameEnd(next);
  if (next.phase !== 'ended') next = advanceTurn(next);
  return next;
}

// ---------- scoring ----------

export function residentialUnits(board: Cell[][], player: PlayerId): number {
  let total = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (cell && cell !== 'townhall' && cell.owner === player && cell.type === 'residential') {
        total += cell.stories;
      }
    }
  }
  return total;
}

export function commercialUnits(board: Cell[][], player: PlayerId): number {
  let total = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (cell && cell !== 'townhall' && cell.owner === player && cell.type === 'commercial') {
        total += cell.stories;
      }
    }
  }
  return total;
}

function largestOwnedCommercialGroup(board: Cell[][], player: PlayerId): { size: number; qualifies: boolean } {
  const visited = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));
  let bestSize = 0;
  let bestQualifies = false;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (visited[r][c] || !cell || cell === 'townhall') continue;
      if (cell.type !== 'commercial' || cell.owner !== player) continue;

      // flood fill this group (only through this player's own commercial tiles)
      const stack: Array<[number, number]> = [[r, c]];
      visited[r][c] = true;
      let size = 0;
      let tallCount = 0;
      while (stack.length) {
        const [cr, cc] = stack.pop()!;
        size += 1;
        const ccell = board[cr][cc];
        if (ccell && ccell !== 'townhall' && ccell.stories >= 2) tallCount += 1;
        for (const [nr, nc] of neighbors(cr, cc)) {
          if (visited[nr][nc]) continue;
          const ncell = board[nr][nc];
          if (ncell && ncell !== 'townhall' && ncell.type === 'commercial' && ncell.owner === player) {
            visited[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
      if (size > bestSize) {
        bestSize = size;
        bestQualifies = tallCount >= 2;
      }
    }
  }
  return { size: bestSize, qualifies: bestQualifies };
}

function singleStoryTileCount(board: Cell[][], player: PlayerId): number {
  let count = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (cell && cell !== 'townhall' && cell.owner === player && cell.stories === 1) count += 1;
    }
  }
  return count;
}

function suburbsUnits(board: Cell[][], player: PlayerId): number {
  let total = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const isEdge = r === 0 || r === BOARD_SIZE - 1 || c === 0 || c === BOARD_SIZE - 1;
      if (!isEdge) continue;
      const cell = board[r][c];
      if (cell && cell !== 'townhall' && cell.owner === player && cell.type === 'residential') {
        total += cell.stories;
      }
    }
  }
  return total;
}

function evaluateAgenda(state: GameState, player: PlayerId): AgendaResult {
  const agenda = state.players[player].agenda;
  const opponent = otherPlayer(player);
  const info = AGENDA_INFO[agenda];

  if (agenda === 'landlord') {
    const mine = residentialUnits(state.board, player);
    const theirs = residentialUnits(state.board, opponent);
    const met = mine > theirs;
    return {
      agenda,
      met,
      vp: met ? info.vp : 0,
      detail: `${mine} residential units vs opponent's ${theirs}.`,
    };
  }

  if (agenda === 'cbd') {
    const mine = largestOwnedCommercialGroup(state.board, player);
    const theirs = largestOwnedCommercialGroup(state.board, opponent);
    const met = mine.qualifies && mine.size > theirs.size;
    return {
      agenda,
      met,
      vp: met ? info.vp : 0,
      detail: `Largest connected commercial group: ${mine.size} tiles (${
        mine.qualifies ? 'qualifies' : 'does not qualify'
      } — needs 2+ tiles at 2+ stories) vs opponent's ${theirs.size}.`,
    };
  }

  if (agenda === 'lowrise') {
    const count = singleStoryTileCount(state.board, player);
    const met = count >= 4;
    return {
      agenda,
      met,
      vp: met ? info.vp : 0,
      detail: `${count} single-story tiles.`,
    };
  }

  // suburbs
  const units = suburbsUnits(state.board, player);
  const met = units >= 3;
  return {
    agenda,
    met,
    vp: met ? info.vp : 0,
    detail: `${units} residential units on edge squares.`,
  };
}

export function scoreBreakdownFor(state: GameState, player: PlayerId): ScoreBreakdown {
  const res = residentialUnits(state.board, player);
  const com = commercialUnits(state.board, player);
  const baseVP = res * VP_PER_UNIT.residential + com * VP_PER_UNIT.commercial;
  const agendaResult = evaluateAgenda(state, player);
  return {
    residentialUnits: res,
    commercialUnits: com,
    baseVP,
    agendaResult,
    totalVP: baseVP + agendaResult.vp,
    cash: state.players[player].cash,
  };
}

export function scoreGame(state: GameState): GameResult {
  const scores: Record<PlayerId, ScoreBreakdown> = {
    P1: scoreBreakdownFor(state, 'P1'),
    P2: scoreBreakdownFor(state, 'P2'),
  };

  let winners: PlayerId[];
  if (scores.P1.totalVP > scores.P2.totalVP) winners = ['P1'];
  else if (scores.P2.totalVP > scores.P1.totalVP) winners = ['P2'];
  else if (scores.P1.cash > scores.P2.cash) winners = ['P1'];
  else if (scores.P2.cash > scores.P1.cash) winners = ['P2'];
  else winners = ['P1', 'P2'];

  const reason =
    winners.length === 2
      ? 'Tied on VP and cash — shared win.'
      : scores[winners[0]].totalVP !== scores[otherPlayer(winners[0])].totalVP
        ? 'Higher total VP.'
        : 'Tied on VP, won on cash tiebreaker.';

  return { scores, winners, reason };
}

export function applyAction(state: GameState, action: Action): GameState {
  if (action.kind === 'build') return applyBuild(state, action.row, action.col, action.tileType);
  if (action.kind === 'stack') return applyStack(state, action.row, action.col);
  return applyPass(state);
}
