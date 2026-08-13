import type { Action, GameState, PlayerId } from '../types';
import { legalBuildActions, legalSetupSquares, legalStackActions, neighbors } from './engine';
import { BOARD_SIZE, INCOME_PER_UNIT } from './constants';

// Simple heuristic AI. Priority: always return a legal action. Beyond that,
// prefer moves that grow income, lean toward the AI's own secret agenda when
// cheap to do so, and otherwise favor commercial (higher income) when affordable.

function isEdge(row: number, col: number): boolean {
  return row === 0 || row === BOARD_SIZE - 1 || col === 0 || col === BOARD_SIZE - 1;
}

export function chooseAiSetupSquare(state: GameState): [number, number] {
  const options = legalSetupSquares(state);
  if (options.length === 0) throw new Error('No legal setup squares');
  // Prefer squares that open up the most future adjacency (more empty neighbors),
  // so the AI doesn't box itself in early.
  let best = options[0];
  let bestScore = -Infinity;
  for (const [r, c] of options) {
    const openNeighbors = neighbors(r, c).filter(([nr, nc]) => state.board[nr][nc] === null).length;
    const score = openNeighbors + Math.random() * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = [r, c];
    }
  }
  return best;
}

export function chooseAiAction(state: GameState, player: PlayerId): Action {
  const agenda = state.players[player].agenda;
  const builds = legalBuildActions(state, player);
  const stacks = legalStackActions(state, player);

  if (builds.length === 0 && stacks.length === 0) {
    return { kind: 'pass' };
  }

  type Scored = { score: number; action: Action };
  const candidates: Scored[] = [];

  for (const b of builds) {
    let score = INCOME_PER_UNIT[b.tileType] * 3 - b.cost;

    if (agenda === 'landlord' && b.tileType === 'residential') score += 2;
    if (agenda === 'suburbs' && b.tileType === 'residential' && isEdge(b.row, b.col)) score += 4;
    if (agenda === 'lowrise') score += 1.5; // building new keeps tiles single-story
    if (agenda === 'cbd' && b.tileType === 'commercial') {
      const nextToOwnCommercial = neighbors(b.row, b.col).some(([nr, nc]) => {
        const cell = state.board[nr][nc];
        return cell && cell !== 'townhall' && cell.owner === player && cell.type === 'commercial';
      });
      score += nextToOwnCommercial ? 4 : 1;
    }

    score += Math.random() * 0.5;
    candidates.push({ score, action: { kind: 'build', row: b.row, col: b.col, tileType: b.tileType } });
  }

  for (const s of stacks) {
    let score = INCOME_PER_UNIT[s.tileType] * 3 - s.cost;

    if (agenda === 'landlord' && s.tileType === 'residential') score += 2;
    if (agenda === 'lowrise') score -= 5; // stacking removes a tile from single-story count
    if (agenda === 'suburbs' && s.tileType === 'residential' && isEdge(s.row, s.col)) score += 4;
    if (agenda === 'cbd' && s.tileType === 'commercial' && s.nextStory === 2) {
      score += 3; // helps qualify a group (needs 2+ tiles at 2+ stories)
    }

    score += Math.random() * 0.5;
    candidates.push({ score, action: { kind: 'stack', row: s.row, col: s.col } });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].action;
}
