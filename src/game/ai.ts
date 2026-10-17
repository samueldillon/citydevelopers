import type { Action, GameState, PlayerId } from '../types';
import {
  currentStackCost,
  eligibleAuctionPlacementSquares,
  legalBuildActions,
  legalStackActions,
  neighbors,
  parkUnits,
  playerState,
  residentialCapacitySurplus,
  residentialRentMultiplier,
  totalOwnedStories,
} from './engine';
import { FREE_UPKEEP_STORIES, INCOME_PER_UNIT, UPKEEP_PER_STORY, VP_PER_UNIT } from './constants';

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
  // Whether the next story added — by a new build or a stack — still falls
  // inside the free-upkeep allowance. Both actions add exactly one story, so
  // this one check covers both.
  const marginalStoryIsFree = totalOwnedStories(state.board, player) < FREE_UPKEEP_STORIES;
  const marginalUpkeep = marginalStoryIsFree ? 0 : UPKEEP_PER_STORY;
  // Park's VP weight decays with how many the player already owns: a
  // strong push toward a first park (and a second), tapering back to the
  // baseline weight after that. A flat weight turned out unworkable —
  // whichever constant made the AI build a first park at all made it build
  // parks almost exclusively once it had a few (confirmed via instrumented
  // self-play: the threshold between "never" and "~45% of all builds" was
  // razor-thin, since build/stack scoring is a strict argmax, not a
  // probabilistic choice — "sometimes competitive" isn't a stable state).
  // Decaying by ownership keeps adoption real but self-limiting instead.
  const ownedParks = parkUnits(state.board, player);
  const parkVpWeight = Math.max(0.8, 2.6 - ownedParks * 0.6);

  for (const b of builds) {
    // Net income (after the new story's own upkeep, if it's past the free
    // allowance) drives most of the scoring, but parks earn no income at
    // all — this VP term is what gives the AI a reason to ever build one.
    // Residential income is also shaped by adjacent parks/commercial, so
    // factor that multiplier in — a spot next to a park is worth chasing,
    // a spot next to commercial is worth avoiding.
    const rentMult = b.tileType === 'residential' ? residentialRentMultiplier(state.board, b.row, b.col) : 1;
    const netIncome = INCOME_PER_UNIT[b.tileType] * rentMult - marginalUpkeep;
    // Park's entire value proposition is its VP — it earns no income ever,
    // so it needs a much stronger VP weight than residential/commercial to
    // be a genuine contender rather than always losing on raw income terms.
    // Without this the AI builds literally zero parks in practice (confirmed
    // via many instrumented self-play games), which makes Urban Jungle
    // uncontested and leaves park's own balance untested by self-play.
    const vpWeight = b.tileType === 'park' ? parkVpWeight : 0.8;
    let score = netIncome * 3 - b.cost + VP_PER_UNIT[b.tileType] * vpWeight;

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
    if (b.tileType === 'park') {
      const nextToOwnPark = neighbors(b.row, b.col, size).some(([nr, nc]) => {
        const cell = state.board[nr][nc];
        return cell && cell !== 'townhall' && cell.owner === player && cell.type === 'park';
      });
      score += nextToOwnPark ? 2 : 0.5; // urban jungle lean, mirrors the CBD lean above
    }

    score += Math.random() * 0.5;
    candidates.push({ score, action: { kind: 'build', row: b.row, col: b.col, tileType: b.tileType } });
  }

  // Stacking a residential tile is often the *only* way to ever unlock
  // capacity for commercial/park (fresh residential builds are always
  // capacity-neutral), so when there's currently no spare capacity, a
  // residential stack has a one-time strategic payoff a pure net-income
  // lens can't see. Without this, the AI can get stuck never stacking at
  // all once stacking's net income looks no better than building new —
  // confirmed via instrumented playtests, every game stalled within
  // seconds, nobody ever unlocking commercial or park.
  const needsCapacity = residentialCapacitySurplus(state.board, player) < 1;

  for (const s of stacks) {
    const rentMult = s.tileType === 'residential' ? residentialRentMultiplier(state.board, s.row, s.col) : 1;
    const netIncome = INCOME_PER_UNIT[s.tileType] * rentMult - marginalUpkeep;
    // Stacking produces VP too (same per-unit rate as a fresh build), which
    // the net-income term alone doesn't capture.
    let score = netIncome * 3 - s.cost + VP_PER_UNIT[s.tileType] * 0.8;

    if (s.tileType === 'residential') {
      score += 1; // land lord lean
      if (needsCapacity) score += 5; // unlocks capacity for commercial/park
    }
    score -= 2.5; // low rise lean: stacking removes a tile from single-story count
    // No suburbs lean here: stacking an edge residential tile now removes
    // it from Suburbs eligibility (unstacked-only) rather than helping, the
    // same tradeoff the low-rise lean above already captures.
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

// Bid a bit above the current floor, more so if it's the AI's own auction
// (it wants the tile it just went looking for), scaled by how much spare
// cash it has and a little randomness so bids aren't perfectly predictable.
export function chooseAiBid(state: GameState, bidder: PlayerId): number {
  const auction = state.auction!;
  const cash = playerState(state, bidder).cash;
  const floor = currentStackCost(state, 3);
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
