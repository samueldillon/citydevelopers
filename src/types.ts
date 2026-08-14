export type PlayerId = 'P1' | 'P2' | 'P3' | 'P4';
export type TileType = 'residential' | 'commercial' | 'park';
export type PlayerKind = 'human' | 'ai';
export type AgendaId = 'landlord' | 'cbd' | 'lowrise' | 'suburbs';
export type GamePhase = 'setup' | 'playing' | 'auction' | 'ended';

export interface BuiltTile {
  type: TileType;
  owner: PlayerId;
  stories: 1 | 2 | 3;
}

export type Cell = BuiltTile | 'townhall' | null;

export interface Pools {
  res2: number;
  com2: number;
  res3: number;
  com3: number;
}

export interface PlayerState {
  cash: number;
  kind: PlayerKind;
  label: string;
}

// A single configured seat, in the order chosen at setup (before the
// turn-order shuffle assigns it a PlayerId).
export interface SeatConfig {
  kind: PlayerKind;
}

export interface SetupStepDef {
  player: PlayerId;
  rule: 'townhall' | 'ownOrTownHall';
}

export interface AgendaResult {
  agenda: AgendaId;
  met: boolean;
  vp: number;
  detail: string;
}

export interface ScoreBreakdown {
  residentialUnits: number;
  commercialUnits: number;
  parkUnits: number;
  baseVP: number;
  agendaResults: AgendaResult[];
  agendaVP: number;
  totalVP: number;
  cash: number;
}

export interface GameResult {
  scores: Partial<Record<PlayerId, ScoreBreakdown>>;
  winners: PlayerId[];
  reason: string;
}

// Wanting a 3rd floor triggers a blind auction instead of a flat price.
// Eligible bidders (own eligible tile of that type + can afford the floor)
// submit sealed bids in turn order starting at the initiator; the winner
// pays their bid and immediately places it on one of their own eligible
// tiles.
export interface AuctionState {
  tileType: TileType;
  initiator: PlayerId;
  eligibleBidders: PlayerId[];
  bids: Partial<Record<PlayerId, number>>;
  nextBidderIndex: number;
  stage: 'bidding' | 'placing';
  winner?: PlayerId;
  winningBid?: number;
}

export interface GameState {
  // Active players for this game, 2-4 entries, in turn order (already
  // randomized at creation — this doubles as both the setup placement order
  // and the ongoing turn rotation).
  playerOrder: PlayerId[];
  phase: GamePhase;
  board: Cell[][];
  players: Partial<Record<PlayerId, PlayerState>>;
  pools: Pools;
  currentPlayer: PlayerId;
  setupStep: number;
  passStreak: number;
  turnNumber: number;
  buildsExecuted: number;
  log: string[];
  result?: GameResult;
  auction?: AuctionState;
}

export type BuildAction = { kind: 'build'; row: number; col: number; tileType: TileType };
export type StackAction = { kind: 'stack'; row: number; col: number };
export type PassAction = { kind: 'pass' };
export type AuctionAction = { kind: 'auction'; row: number; col: number };
export type SetupAction = { kind: 'setupPlace'; row: number; col: number };
export type Action = BuildAction | StackAction | PassAction | AuctionAction;
