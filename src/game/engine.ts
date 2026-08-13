import type {
  Action,
  AgendaId,
  AgendaResult,
  BuiltTile,
  Cell,
  GameResult,
  GameState,
  PlayerId,
  PlayerState,
  Pools,
  ScoreBreakdown,
  SeatConfig,
  SetupStepDef,
  TileType,
} from '../types';
import {
  AGENDA_INFO,
  ALL_AGENDAS,
  ALL_PLAYER_IDS,
  BOARD_SIZE,
  BUILD_COST,
  INCOME_PER_UNIT,
  INITIAL_POOLS,
  MAX_PLAYERS,
  MAX_STORIES,
  MIN_PLAYERS,
  PRICE_TIER_INCREMENT,
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

// Every read of a player's state should go through here — state.players only
// ever holds entries for the game's active playerOrder, so a lookup miss
// means a caller passed an id that isn't actually in this game.
export function playerState(state: GameState, id: PlayerId): PlayerState {
  const p = state.players[id];
  if (!p) throw new Error(`Player ${id} is not active in this game`);
  return p;
}

export function nextPlayer(playerOrder: PlayerId[], current: PlayerId): PlayerId {
  const idx = playerOrder.indexOf(current);
  return playerOrder[(idx + 1) % playerOrder.length];
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

export function isAdjacentToTownHall(row: number, col: number): boolean {
  return neighbors(row, col).some(([r, c]) => r === TOWN_HALL_ROW && c === TOWN_HALL_COL);
}

export function isAdjacentToOwnTile(board: Cell[][], row: number, col: number, player: PlayerId): boolean {
  return neighbors(row, col).some(([r, c]) => {
    const cell = board[r][c];
    return cell !== null && cell !== 'townhall' && cell.owner === player;
  });
}

// A player may only build adjacent to Town Hall or a tile they already own —
// their development has to grow out from their own footprint, not piggyback
// on another player's.
export function isAdjacentToOwnOrTownHall(board: Cell[][], row: number, col: number, player: PlayerId): boolean {
  return isAdjacentToTownHall(row, col) || isAdjacentToOwnTile(board, row, col, player);
}

// ---------- setup ----------

export function createInitialState(seats: SeatConfig[]): GameState {
  if (seats.length < MIN_PLAYERS || seats.length > MAX_PLAYERS) {
    throw new Error(`Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}`);
  }

  const board: Cell[][] = Array.from({ length: BOARD_SIZE }, () => Array<Cell>(BOARD_SIZE).fill(null));
  board[TOWN_HALL_ROW][TOWN_HALL_COL] = 'townhall';

  const ids = ALL_PLAYER_IDS.slice(0, seats.length);
  const humanCount = seats.filter((s) => s.kind === 'human').length;
  const aiCount = seats.length - humanCount;

  const players: Partial<Record<PlayerId, PlayerState>> = {};
  ids.forEach((id, i) => {
    const kind = seats[i].kind;
    const seatNumber = i + 1;
    const label =
      kind === 'human'
        ? humanCount === 1
          ? 'You'
          : `Player ${seatNumber}`
        : aiCount === 1
          ? 'Computer'
          : `Computer ${seatNumber}`;
    players[id] = { cash: STARTING_CASH, kind, label };
  });

  // The coin flip generalizes to a full random turn order, fixed for the game.
  const playerOrder = shuffle(ids);
  const pools: Pools = { ...INITIAL_POOLS };
  const firstLabel = players[playerOrder[0]]!.label;

  return {
    playerOrder,
    phase: 'setup',
    board,
    players,
    pools,
    currentPlayer: playerOrder[0],
    setupStep: 0,
    passStreak: 0,
    turnNumber: 0,
    buildsExecuted: 0,
    log: [`${firstLabel} won the coin flip and places first.`],
  };
}

// Setup is two rounds through the turn order: everyone places their first
// tile (adjacent to Town Hall only), then everyone places their second tile
// (adjacent to Town Hall or their own first tile).
export function buildSetupSequence(playerOrder: PlayerId[]): SetupStepDef[] {
  const round1 = playerOrder.map((player) => ({ player, rule: 'townhall' as const }));
  const round2 = playerOrder.map((player) => ({ player, rule: 'ownOrTownHall' as const }));
  return [...round1, ...round2];
}

export function legalSetupSquares(state: GameState): Array<[number, number]> {
  if (state.phase !== 'setup') return [];
  const stepDef = buildSetupSequence(state.playerOrder)[state.setupStep];
  if (!stepDef) return [];
  const result: Array<[number, number]> = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (state.board[r][c] !== null) continue;
      if (stepDef.rule === 'townhall') {
        if (isAdjacentToTownHall(r, c)) result.push([r, c]);
      } else {
        if (isAdjacentToOwnOrTownHall(state.board, r, c, stepDef.player)) result.push([r, c]);
      }
    }
  }
  return result;
}

export function placeSetupTile(state: GameState, row: number, col: number): GameState {
  const sequence = buildSetupSequence(state.playerOrder);
  const stepDef = sequence[state.setupStep];
  if (!stepDef) throw new Error('Setup already complete');
  const legal = legalSetupSquares(state);
  if (!legal.some(([r, c]) => r === row && c === col)) {
    throw new Error('Illegal setup placement');
  }

  const board = cloneBoard(state.board);
  const tile: BuiltTile = { type: 'residential', owner: stepDef.player, stories: 1 };
  board[row][col] = tile;

  const nextSetupStep = state.setupStep + 1;
  const label = `${playerState(state, stepDef.player).label} places a residential tile at (${row + 1}, ${col + 1}).`;

  if (nextSetupStep >= sequence.length) {
    const firstPlayer = state.playerOrder[0];
    return {
      ...state,
      board,
      setupStep: nextSetupStep,
      phase: 'playing',
      currentPlayer: firstPlayer,
      turnNumber: 1,
      log: [...state.log, label, `Setup complete. ${playerState(state, firstPlayer).label} takes the first turn.`],
    };
  }

  return {
    ...state,
    board,
    setupStep: nextSetupStep,
    currentPlayer: sequence[nextSetupStep].player,
    log: [...state.log, label],
  };
}

// ---------- legal actions during play ----------

export function emptyAdjacencyLegalSquares(board: Cell[][], player: PlayerId): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === null && isAdjacentToOwnOrTownHall(board, r, c, player)) {
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

// Every tile a player owns needs a residential unit behind it — commercial tiles
// are staffed by residents, so a new commercial build is only legal while the
// player has at least one unit of spare residential capacity (residential units
// minus tiles currently occupied). Residential builds are always capacity-neutral:
// they add one occupied tile and one residential unit at the same time.
export function residentialCapacitySurplus(board: Cell[][], player: PlayerId): number {
  return residentialUnits(board, player) - occupiedTiles(board, player);
}

// New-build prices climb with the pace of the game: every N new builds (N =
// active player count, either type, any player) bumps both types' price by
// PRICE_TIER_INCREMENT. Sizing the tier to the player count means each tier
// gives every player an equal shot at it regardless of turn order. Stacking
// is unaffected.
export function currentBuildPriceTier(state: GameState): number {
  return Math.floor(state.buildsExecuted / state.playerOrder.length);
}

export function currentBuildCost(state: GameState, tileType: TileType): number {
  return BUILD_COST[tileType] + currentBuildPriceTier(state) * PRICE_TIER_INCREMENT;
}

export function legalBuildActions(state: GameState, player: PlayerId): LegalBuild[] {
  const squares = emptyAdjacencyLegalSquares(state.board, player);
  const cash = playerState(state, player).cash;
  const hasResidentialCapacity = residentialCapacitySurplus(state.board, player) >= 1;
  const result: LegalBuild[] = [];
  for (const [r, c] of squares) {
    (['residential', 'commercial'] as TileType[]).forEach((tileType) => {
      const cost = currentBuildCost(state, tileType);
      if (cash < cost) return;
      if (tileType === 'commercial' && !hasResidentialCapacity) return;
      result.push({ row: r, col: c, tileType, cost });
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
  const cash = playerState(state, player).cash;
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

// Only the player who just took a turn (build, stack, or pass) collects
// income for it — not every other player too.
function collectIncome(state: GameState): GameState {
  const player = state.currentPlayer;
  let income = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = state.board[r][c];
      if (cell && cell !== 'townhall' && cell.owner === player) {
        income += INCOME_PER_UNIT[cell.type] * cell.stories;
      }
    }
  }
  const ps = playerState(state, player);
  const players = { ...state.players, [player]: { ...ps, cash: ps.cash + income } };
  return { ...state, players };
}

function checkGameEnd(state: GameState): GameState {
  const boardFull = state.board.every((row) => row.every((cell) => cell !== null));
  // "Both players pass in a row" generalizes to a full round (every active
  // player) passing with nobody acting.
  const allPassed = state.passStreak >= state.playerOrder.length;

  if (boardFull || allPassed) {
    const result = scoreGame(state);
    return { ...state, phase: 'ended', result };
  }
  return state;
}

function advanceTurn(state: GameState): GameState {
  return {
    ...state,
    currentPlayer: nextPlayer(state.playerOrder, state.currentPlayer),
    turnNumber: state.turnNumber + 1,
  };
}

export function applyBuild(state: GameState, row: number, col: number, tileType: TileType): GameState {
  const player = state.currentPlayer;
  const legal = legalBuildActions(state, player).some(
    (a) => a.row === row && a.col === col && a.tileType === tileType,
  );
  if (!legal) throw new Error('Illegal build action');

  const cost = currentBuildCost(state, tileType);
  const board = cloneBoard(state.board);
  const tile: BuiltTile = { type: tileType, owner: player, stories: 1 };
  board[row][col] = tile;

  const players = { ...state.players };
  const ps = playerState(state, player);
  players[player] = { ...ps, cash: ps.cash - cost };

  let next: GameState = {
    ...state,
    board,
    players,
    passStreak: 0,
    buildsExecuted: state.buildsExecuted + 1,
    log: [...state.log, `${ps.label} builds ${tileType} at (${row + 1}, ${col + 1}) for $${cost}M.`],
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
  const ps = playerState(state, player);
  players[player] = { ...ps, cash: ps.cash - action.cost };

  const pools = { ...state.pools, [action.poolKey]: state.pools[action.poolKey] - 1 };

  let next: GameState = {
    ...state,
    board,
    players,
    pools,
    passStreak: 0,
    log: [
      ...state.log,
      `${ps.label} adds a floor (${action.nextStory}${action.nextStory === 2 ? 'nd' : 'rd'}) to their ${
        action.tileType
      } tile at (${row + 1}, ${col + 1}).`,
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
    log: [...state.log, `${playerState(state, player).label} passes.`],
  };
  next = collectIncome(next);
  next = checkGameEnd(next);
  if (next.phase !== 'ended') next = advanceTurn(next);
  return next;
}

// ---------- scoring ----------

export function occupiedTiles(board: Cell[][], player: PlayerId): number {
  let total = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (cell && cell !== 'townhall' && cell.owner === player) total += 1;
    }
  }
  return total;
}

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

// Every agenda has exactly one winner — no ties. Among players who qualify
// (Land Lord and Central Business District have no minimum, so everyone
// qualifies; Low Rise and Suburbs still gate on their numeric floor), the
// highest metric wins. A tie is broken by cash on hand, then by turn order,
// so there is always exactly one winner once at least one player qualifies.
function determineAgendaWinner(
  state: GameState,
  metric: (p: PlayerId) => number,
  qualifies: (p: PlayerId) => boolean,
): PlayerId | null {
  const qualified = state.playerOrder.filter(qualifies);
  if (qualified.length === 0) return null;

  const maxValue = Math.max(...qualified.map(metric));
  const leaders = qualified.filter((p) => metric(p) === maxValue);
  if (leaders.length === 1) return leaders[0];

  const maxCash = Math.max(...leaders.map((p) => playerState(state, p).cash));
  const cashLeaders = leaders.filter((p) => playerState(state, p).cash === maxCash);
  if (cashLeaders.length === 1) return cashLeaders[0];

  return state.playerOrder.find((p) => cashLeaders.includes(p))!;
}

function bestOtherValue(playerOrder: PlayerId[], player: PlayerId, metric: (p: PlayerId) => number): number {
  const others = playerOrder.filter((p) => p !== player).map(metric);
  return others.length ? Math.max(...others) : 0;
}

// Agendas are public objectives, not a single secret dealt to each player —
// every player is evaluated against all four, and can win any (or all) of
// them.
function evaluateAgenda(state: GameState, player: PlayerId, agenda: AgendaId): AgendaResult {
  const info = AGENDA_INFO[agenda];

  if (agenda === 'landlord') {
    const metric = (p: PlayerId) => residentialUnits(state.board, p);
    const winner = determineAgendaWinner(state, metric, () => true);
    const met = winner === player;
    const best = bestOtherValue(state.playerOrder, player, metric);
    return {
      agenda,
      met,
      vp: met ? info.vp : 0,
      detail: `${metric(player)} residential units vs the best of the rest, ${best}.`,
    };
  }

  if (agenda === 'cbd') {
    const groups = new Map(state.playerOrder.map((p) => [p, largestOwnedCommercialGroup(state.board, p)]));
    const metric = (p: PlayerId) => groups.get(p)!.size;
    const qualifies = (p: PlayerId) => groups.get(p)!.qualifies;
    const winner = determineAgendaWinner(state, metric, qualifies);
    const met = winner === player;
    const mine = groups.get(player)!;
    const best = bestOtherValue(state.playerOrder, player, metric);
    return {
      agenda,
      met,
      vp: met ? info.vp : 0,
      detail: `Largest connected commercial group: ${mine.size} tiles (${
        mine.qualifies ? 'qualifies' : 'does not qualify'
      } — needs 2+ tiles at 2+ stories) vs the best of the rest, ${best}.`,
    };
  }

  if (agenda === 'lowrise') {
    const metric = (p: PlayerId) => singleStoryTileCount(state.board, p);
    const qualifies = (p: PlayerId) => metric(p) >= 4;
    const winner = determineAgendaWinner(state, metric, qualifies);
    const met = winner === player;
    const best = bestOtherValue(state.playerOrder, player, metric);
    return {
      agenda,
      met,
      vp: met ? info.vp : 0,
      detail: `${metric(player)} single-story tiles vs the best of the rest, ${best}.`,
    };
  }

  // suburbs
  const metric = (p: PlayerId) => suburbsUnits(state.board, p);
  const qualifies = (p: PlayerId) => metric(p) >= 3;
  const winner = determineAgendaWinner(state, metric, qualifies);
  const met = winner === player;
  const best = bestOtherValue(state.playerOrder, player, metric);
  return {
    agenda,
    met,
    vp: met ? info.vp : 0,
    detail: `${metric(player)} residential units on edge squares vs the best of the rest, ${best}.`,
  };
}

export function evaluateAllAgendas(state: GameState, player: PlayerId): AgendaResult[] {
  return ALL_AGENDAS.map((agenda) => evaluateAgenda(state, player, agenda));
}

export function scoreBreakdownFor(state: GameState, player: PlayerId): ScoreBreakdown {
  const res = residentialUnits(state.board, player);
  const com = commercialUnits(state.board, player);
  const baseVP = res * VP_PER_UNIT.residential + com * VP_PER_UNIT.commercial;
  const agendaResults = evaluateAllAgendas(state, player);
  const agendaVP = agendaResults.reduce((sum, r) => sum + r.vp, 0);
  return {
    residentialUnits: res,
    commercialUnits: com,
    baseVP,
    agendaResults,
    agendaVP,
    totalVP: baseVP + agendaVP,
    cash: playerState(state, player).cash,
  };
}

export function scoreGame(state: GameState): GameResult {
  const scores: Partial<Record<PlayerId, ScoreBreakdown>> = {};
  state.playerOrder.forEach((p) => {
    scores[p] = scoreBreakdownFor(state, p);
  });

  const maxVP = Math.max(...state.playerOrder.map((p) => scores[p]!.totalVP));
  const vpLeaders = state.playerOrder.filter((p) => scores[p]!.totalVP === maxVP);

  let winners: PlayerId[];
  let reason: string;
  if (vpLeaders.length === 1) {
    winners = vpLeaders;
    reason = 'Higher total VP.';
  } else {
    const maxCash = Math.max(...vpLeaders.map((p) => scores[p]!.cash));
    const cashLeaders = vpLeaders.filter((p) => scores[p]!.cash === maxCash);
    winners = cashLeaders;
    reason = cashLeaders.length === 1 ? 'Tied on VP, won on cash tiebreaker.' : 'Tied on VP and cash — shared win.';
  }

  return { scores, winners, reason };
}

export function applyAction(state: GameState, action: Action): GameState {
  if (action.kind === 'build') return applyBuild(state, action.row, action.col, action.tileType);
  if (action.kind === 'stack') return applyStack(state, action.row, action.col);
  return applyPass(state);
}
