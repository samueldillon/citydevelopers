import type { Action, GameState, PlayerId } from '../types';
import {
  eligibleAuctionPlacementSquares,
  legalBuildActions,
  legalStackActions,
  neighbors,
  playerState,
  residentialRentMultiplier,
} from './engine';
import { INCOME_PER_UNIT, STACK_COST, VP_PER_UNIT } from './constants';

// Simple heuristic AI. Priority: always return a legal action. Beyond that,
// prefer moves that grow income, and since every agenda is open to any
// player now (not one dealt in secret), lean a little toward all four
// agenda-friendly patterns at once rather than committing to just one.

function isEdge(row: number, col: number, size: number): boolean {
  return row === 0 || row === size - 1 || col === 0 || col === size - 1;
}

export function chooseAiAction(state: GameState, player: PlayerId): Action {
  const builds = legalBuildActions(state, player);
  const stacks = legalStackActions(state, player);

  if (builds.length === 0 && stacks.length === 0) {
    return { kind: 'pass' };
  }

  type Scored = { score: number; action: Action };
  const candidates: Scored[] = [];
  const size = state.board.length;

  for (const b of builds) {
    // Income drives most of the scoring, but parks earn no income at all —
    // this VP term is what gives the AI a reason to ever build one.
    // Residential income is also shaped by adjacent parks/commercial, so
    // factor that multiplier in — a spot next to a park is worth chasing,
    // a spot next to commercial is worth avoiding.
    const rentMult = b.tileType === 'residential' ? residentialRentMultiplier(state.board, b.row, b.col) : 1;
    let score = INCOME_PER_UNIT[b.tileType] * rentMult * 3 - b.cost + VP_PER_UNIT[b.tileType] * 0.8;

    if (b.tileType === 'residential') score += 1; // land lord lean
    if (b.tileType === 'residential' && isEdge(b.row, b.col, size)) score += 2; // suburbs lean
    score += 0.75; // low rise lean: building new keeps tiles single-story
    if (b.tileType === 'commercial') {
      const nextToOwnCommercial = neighbors(b.row, b.col, size).some(([nr, nc]) => {
        const cell = state.board[nr][nc];
        return cell && cell !== 'townhall' && cell.owner === player && cell.type === 'commercial';
      });
      score += nextToOwnCommercial ? 2 : 0.5; // central business district lean
    }

    score += Math.random() * 0.5;
    candidates.push({ score, action: { kind: 'build', row: b.row, col: b.col, tileType: b.tileType } });
  }

  for (const s of stacks) {
    const rentMult = s.tileType === 'residential' ? residentialRentMultiplier(state.board, s.row, s.col) : 1;
    let score = INCOME_PER_UNIT[s.tileType] * rentMult * 3 - s.cost;

    if (s.tileType === 'residential') score += 1; // land lord lean
    score -= 2.5; // low rise lean: stacking removes a tile from single-story count
    if (s.tileType === 'residential' && isEdge(s.row, s.col, size)) score += 2; // suburbs lean
    if (s.tileType === 'commercial' && s.nextStory === 2) score += 1.5; // helps qualify a CBD group

    score += Math.random() * 0.5;
    // A 3rd floor is scarce enough to go to a blind auction rather than a
    // flat stack — the AI treats "I'd like one" the same as a normal stack
    // decision; the eventual price is settled by the auction, not here.
    const action: Action =
      s.nextStory === 3 ? { kind: 'auction', row: s.row, col: s.col } : { kind: 'stack', row: s.row, col: s.col };
    candidates.push({ score, action });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].action;
}

// Bid a bit above the $3M floor, more so if it's the AI's own auction (it
// wants the tile it just went looking for), scaled by how much spare cash it
// has and a little randomness so bids aren't perfectly predictable.
export function chooseAiBid(state: GameState, bidder: PlayerId): number {
  const auction = state.auction!;
  const cash = playerState(state, bidder).cash;
  const floor = STACK_COST[3];
  const isInitiator = auction.initiator === bidder;
  const willingness = isInitiator ? 0.4 : 0.2;
  const spare = Math.max(0, cash - floor);
  const extra = Math.floor(spare * willingness * Math.random());
  return Math.min(cash, floor + extra);
}

// When the AI wins an auction and owns more than one eligible tile of the
// right type, prefer the one already surrounded by the most of its own
// commercial tiles, to help build toward a Central Business District cluster.
export function chooseAiAuctionPlacement(state: GameState): [number, number] {
  const options = eligibleAuctionPlacementSquares(state);
  if (options.length === 0) throw new Error('No eligible auction placement squares');
  const auction = state.auction!;
  if (auction.tileType !== 'commercial' || !auction.winner) return options[0];

  const winner = auction.winner;
  let best = options[0];
  let bestScore = -1;
  for (const [r, c] of options) {
    const ownCommercialNeighbors = neighbors(r, c, state.board.length).filter(([nr, nc]) => {
      const cell = state.board[nr][nc];
      return cell && cell !== 'townhall' && cell.owner === winner && cell.type === 'commercial';
    }).length;
    if (ownCommercialNeighbors > bestScore) {
      bestScore = ownCommercialNeighbors;
      best = [r, c];
    }
  }
  return best;
}
