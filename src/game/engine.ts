import type {
  Action,
  AgendaId,
  AgendaResult,
  AuctionState,
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
  BUILD_COST,
  INCOME_PER_UNIT,
  MAX_PLAYERS,
  MAX_STORIES,
  MIN_PLAYERS,
  poolsForBoardSize,
  PRICE_TIER_INCREMENT,
  STACK_COST,
  STARTING_CASH,
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

// playerOrder rotated so `start` comes first — used both for auction bidding
// order and for tie-breaks that favor whoever is "closest to the left of" a
// given player.
function cyclicFrom(playerOrder: PlayerId[], start: PlayerId): PlayerId[] {
  const idx = playerOrder.indexOf(start);
  return [...playerOrder.slice(idx), ...playerOrder.slice(0, idx)];
}

export function cloneBoard(board: Cell[][]): Cell[][] {
  return board.map((row) => row.map((cell) => (cell && cell !== 'townhall' ? { ...cell } : cell)));
}

export function townHallPos(size: number): number {
  return Math.floor(size / 2);
}

export function neighbors(row: number, col: number, size: number): Array<[number, number]> {
  const deltas: Array<[number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  return deltas
    .map(([dr, dc]): [number, number] => [row + dr, col + dc])
    .filter(([r, c]) => r >= 0 && r < size && c >= 0 && c < size);
}

export function isAdjacentToTownHall(row: number, col: number, size: number): boolean {
  const th = townHallPos(size);
  return neighbors(row, col, size).some(([r, c]) => r === th && c === th);
}

export function isAdjacentToOwnTile(board: Cell[][], row: number, col: number, player: PlayerId): boolean {
  return neighbors(row, col, board.length).some(([r, c]) => {
    const cell = board[r][c];
    return cell !== null && cell !== 'townhall' && cell.owner === player;
  });
}

// A player may only build adjacent to Town Hall or a tile they already own —
// their development has to grow out from their own footprint, not piggyback
// on another player's.
export function isAdjacentToOwnOrTownHall(board: Cell[][], row: number, col: number, player: PlayerId): boolean {
  return isAdjacentToTownHall(row, col, board.length) || isAdjacentToOwnTile(board, row, col, player);
}

// ---------- setup ----------

export function createInitialState(seats: SeatConfig[], boardSize: number): GameState {
  if (seats.length < MIN_PLAYERS || seats.length > MAX_PLAYERS) {
    throw new Error(`Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}`);
  }

  const board: Cell[][] = Array.from({ length: boardSize }, () => Array<Cell>(boardSize).fill(null));
  const th = townHallPos(boardSize);
  board[th][th] = 'townhall';

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
  const pools: Pools = poolsForBoardSize(boardSize);
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
  const size = state.board.length;
  const result: Array<[number, number]> = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (state.board[r][c] !== null) continue;
      if (stepDef.rule === 'townhall') {
        if (isAdjacentToTownHall(r, c, size)) result.push([r, c]);
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
  const size = board.length;
  const result: Array<[number, number]> = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
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
  const size = state.board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
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
  const size = state.board.length;
  let income = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
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

// Stacking to a 2nd floor is a normal flat-cost action. Stacking to a 3rd
// floor is scarce enough to fight over — see initiateAuction below, which
// this function no longer handles.
export function applyStack(state: GameState, row: number, col: number): GameState {
  const player = state.currentPlayer;
  const action = legalStackActions(state, player).find(
    (a) => a.row === row && a.col === col && a.nextStory === 2,
  );
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
      `${ps.label} adds a floor (2nd) to their ${action.tileType} tile at (${row + 1}, ${col + 1}).`,
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

// ---------- blind auctions for 3rd floors ----------

function hasEligibleThirdFloorTile(board: Cell[][], player: PlayerId, tileType: TileType): boolean {
  const size = board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = board[r][c];
      if (cell && cell !== 'townhall' && cell.owner === player && cell.type === tileType && cell.stories === 2) {
        return true;
      }
    }
  }
  return false;
}

// Wanting a 3rd floor triggers a blind auction instead of a flat price.
// Every player who currently has an eligible tile of that type and can
// afford the $3M floor may bid, in turn order starting with whoever
// initiated it. The winner pays their bid (replacing the flat cost) and
// immediately places it on one of their own eligible tiles — it can't be
// banked. Turn order then simply continues as normal from the initiator;
// winning the auction does not grant the winner an extra turn.
export function initiateAuction(state: GameState, row: number, col: number): GameState {
  const player = state.currentPlayer;
  const action = legalStackActions(state, player).find(
    (a) => a.row === row && a.col === col && a.nextStory === 3,
  );
  if (!action) throw new Error('Illegal auction initiation');

  const tileType = action.tileType;
  const eligibleBidders = cyclicFrom(state.playerOrder, player).filter((p) => {
    const cash = playerState(state, p).cash;
    return cash >= STACK_COST[3] && hasEligibleThirdFloorTile(state.board, p, tileType);
  });

  const auction: AuctionState = {
    tileType,
    initiator: player,
    eligibleBidders,
    bids: {},
    nextBidderIndex: 0,
    stage: 'bidding',
  };

  return {
    ...state,
    phase: 'auction',
    auction,
    log: [
      ...state.log,
      `${playerState(state, player).label} triggers a blind auction for a 3rd floor ${tileType} tile.`,
    ],
  };
}

export function currentAuctionBidder(state: GameState): PlayerId | null {
  if (state.phase !== 'auction' || !state.auction || state.auction.stage !== 'bidding') return null;
  return state.auction.eligibleBidders[state.auction.nextBidderIndex] ?? null;
}

export function submitAuctionBid(state: GameState, bidder: PlayerId, amount: number): GameState {
  const auction = state.auction;
  if (state.phase !== 'auction' || !auction || auction.stage !== 'bidding') {
    throw new Error('No auction bidding in progress');
  }
  const expected = auction.eligibleBidders[auction.nextBidderIndex];
  if (expected !== bidder) throw new Error("Not this bidder's turn to bid");

  const cash = playerState(state, bidder).cash;
  const clamped = Math.max(STACK_COST[3], Math.min(Math.round(amount), cash));

  const bids = { ...auction.bids, [bidder]: clamped };
  const nextBidderIndex = auction.nextBidderIndex + 1;
  let next: GameState = { ...state, auction: { ...auction, bids, nextBidderIndex } };

  if (nextBidderIndex >= auction.eligibleBidders.length) {
    next = resolveAuctionBids(next);
  }
  return next;
}

function resolveAuctionBids(state: GameState): GameState {
  const auction = state.auction!;
  const maxBid = Math.max(...auction.eligibleBidders.map((p) => auction.bids[p]!));
  const leaders = auction.eligibleBidders.filter((p) => auction.bids[p] === maxBid);
  // Ties favor whoever is closest to the left of the initiator.
  const cyclic = cyclicFrom(state.playerOrder, auction.initiator);
  const winner = cyclic.find((p) => leaders.includes(p))!;

  return {
    ...state,
    auction: { ...auction, stage: 'placing', winner, winningBid: maxBid },
    log: [
      ...state.log,
      `Auction resolved: ${playerState(state, winner).label} wins the 3rd floor ${auction.tileType} tile for $${maxBid}M.`,
    ],
  };
}

export function eligibleAuctionPlacementSquares(state: GameState): Array<[number, number]> {
  const auction = state.auction;
  if (state.phase !== 'auction' || !auction || auction.stage !== 'placing' || !auction.winner) return [];
  const size = state.board.length;
  const result: Array<[number, number]> = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = state.board[r][c];
      if (
        cell &&
        cell !== 'townhall' &&
        cell.owner === auction.winner &&
        cell.type === auction.tileType &&
        cell.stories === 2
      ) {
        result.push([r, c]);
      }
    }
  }
  return result;
}

export function applyAuctionPlacement(state: GameState, row: number, col: number): GameState {
  const auction = state.auction;
  if (state.phase !== 'auction' || !auction || auction.stage !== 'placing' || !auction.winner) {
    throw new Error('No auction placement in progress');
  }
  const legal = eligibleAuctionPlacementSquares(state).some(([r, c]) => r === row && c === col);
  if (!legal) throw new Error('Illegal auction placement');

  const board = cloneBoard(state.board);
  const cell = board[row][col];
  if (!cell || cell === 'townhall') throw new Error('No tile to stack on');
  cell.stories = 3;

  const poolKey = auction.tileType === 'residential' ? 'res3' : 'com3';
  const pools = { ...state.pools, [poolKey]: state.pools[poolKey] - 1 };

  const players = { ...state.players };
  const ws = playerState(state, auction.winner);
  players[auction.winner] = { ...ws, cash: ws.cash - auction.winningBid! };

  let next: GameState = {
    ...state,
    board,
    players,
    pools,
    phase: 'playing',
    auction: undefined,
    passStreak: 0,
    log: [...state.log, `${ws.label} places their 3rd floor ${auction.tileType} tile at (${row + 1}, ${col + 1}).`],
  };
  next = collectIncome(next);
  next = checkGameEnd(next);
  if (next.phase !== 'ended') next = advanceTurn(next);
  return next;
}

// ---------- scoring ----------

export function occupiedTiles(board: Cell[][], player: PlayerId): number {
  const size = board.length;
  let total = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = board[r][c];
      if (cell && cell !== 'townhall' && cell.owner === player) total += 1;
    }
  }
  return total;
}

export function residentialUnits(board: Cell[][], player: PlayerId): number {
  const size = board.length;
  let total = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = board[r][c];
      if (cell && cell !== 'townhall' && cell.owner === player && cell.type === 'residential') {
        total += cell.stories;
      }
    }
  }
  return total;
}

export function commercialUnits(board: Cell[][], player: PlayerId): number {
  const size = board.length;
  let total = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = board[r][c];
      if (cell && cell !== 'townhall' && cell.owner === player && cell.type === 'commercial') {
        total += cell.stories;
      }
    }
  }
  return total;
}

// Largest connected cluster of a player's own commercial tiles, scored by
// total commercial units (stories) in that cluster — not raw tile count, so
// stacking within a cluster helps win it too.
function largestOwnedCommercialClusterUnits(board: Cell[][], player: PlayerId): number {
  const size = board.length;
  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  let best = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = board[r][c];
      if (visited[r][c] || !cell || cell === 'townhall') continue;
      if (cell.type !== 'commercial' || cell.owner !== player) continue;

      // flood fill this cluster (only through this player's own commercial tiles)
      const stack: Array<[number, number]> = [[r, c]];
      visited[r][c] = true;
      let units = 0;
      while (stack.length) {
        const [cr, cc] = stack.pop()!;
        const ccell = board[cr][cc];
        if (ccell && ccell !== 'townhall') units += ccell.stories;
        for (const [nr, nc] of neighbors(cr, cc, size)) {
          if (visited[nr][nc]) continue;
          const ncell = board[nr][nc];
          if (ncell && ncell !== 'townhall' && ncell.type === 'commercial' && ncell.owner === player) {
            visited[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
      if (units > best) best = units;
    }
  }
  return best;
}

function singleStoryTileCount(board: Cell[][], player: PlayerId): number {
  const size = board.length;
  let count = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = board[r][c];
      if (cell && cell !== 'townhall' && cell.owner === player && cell.stories === 1) count += 1;
    }
  }
  return count;
}

function suburbsUnits(board: Cell[][], player: PlayerId): number {
  const size = board.length;
  let total = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const isEdge = r === 0 || r === size - 1 || c === 0 || c === size - 1;
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
    const metric = (p: PlayerId) => largestOwnedCommercialClusterUnits(state.board, p);
    const winner = determineAgendaWinner(state, metric, () => true);
    const met = winner === player;
    const best = bestOtherValue(state.playerOrder, player, metric);
    return {
      agenda,
      met,
      vp: met ? info.vp : 0,
      detail: `Biggest connected commercial cluster: ${metric(player)} units vs the best of the rest, ${best}.`,
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
  if (action.kind === 'auction') return initiateAuction(state, action.row, action.col);
  return applyPass(state);
}
