import type { GameState, TileType } from '../types';
import {
  currentBuildCost,
  legalBuildActions,
  legalStackActions,
  playerState,
  residentialCapacitySurplus,
} from '../game/engine';

interface Props {
  state: GameState;
  selectedCell: [number, number] | null;
  onBuild: (tileType: TileType) => void;
  onStack: () => void;
  onStartAuction: () => void;
  onCancel: () => void;
  onPass: () => void;
  canPass: boolean;
}

export default function ActionPanel({
  state,
  selectedCell,
  onBuild,
  onStack,
  onStartAuction,
  onCancel,
  onPass,
  canPass,
}: Props) {
  const player = state.currentPlayer;
  const cash = playerState(state, player).cash;

  if (!selectedCell) {
    return (
      <div className="action-panel">
        <p className="hint">Click a highlighted square to build, or click one of your own tiles to add a floor.</p>
        <button className="pass-btn" onClick={onPass} disabled={!canPass}>
          Pass
        </button>
      </div>
    );
  }

  const [row, col] = selectedCell;
  const cell = state.board[row][col];

  if (cell === null) {
    const builds = legalBuildActions(state, player).filter((a) => a.row === row && a.col === col);
    const canResidential = builds.some((a) => a.tileType === 'residential');
    const canCommercial = builds.some((a) => a.tileType === 'commercial');
    const canPark = builds.some((a) => a.tileType === 'park');
    const surplus = residentialCapacitySurplus(state.board, player);
    const residentialCost = currentBuildCost(state, 'residential');
    const commercialCost = currentBuildCost(state, 'commercial');
    const parkCost = currentBuildCost(state, 'park');
    return (
      <div className="action-panel">
        <p className="hint">
          Build at ({row + 1}, {col + 1}):
        </p>
        <button disabled={!canResidential} onClick={() => onBuild('residential')}>
          Residential — ${residentialCost}M
        </button>
        <button disabled={!canCommercial} onClick={() => onBuild('commercial')}>
          Commercial — ${commercialCost}M
        </button>
        <button disabled={!canPark} onClick={() => onBuild('park')}>
          Park — ${parkCost}M (5 VP, no income)
        </button>
        <button className="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
        {cash < residentialCost && <p className="warn">Not enough cash to build here.</p>}
        {!canCommercial && !canPark && surplus < 1 && cash >= commercialCost && (
          <p className="warn">
            Every tile needs a resident behind it — stack a residential tile to free up capacity before building
            commercial or a park.
          </p>
        )}
      </div>
    );
  }

  if (cell !== 'townhall' && cell.owner === player) {
    const stack = legalStackActions(state, player).find((a) => a.row === row && a.col === col);
    return (
      <div className="action-panel">
        <p className="hint">
          Your {cell.type} tile at ({row + 1}, {col + 1}) — {cell.stories} {cell.stories === 1 ? 'story' : 'stories'}
        </p>
        {cell.type === 'park' && <p className="warn">Parks are single-story — nothing to stack here.</p>}
        {stack && stack.nextStory === 2 && (
          <button onClick={onStack}>Add 2nd floor — ${stack.cost}M</button>
        )}
        {stack && stack.nextStory === 3 && (
          <button onClick={onStartAuction}>Start blind auction for 3rd floor — min ${stack.cost}M</button>
        )}
        {!stack && cell.type !== 'park' && (
          <p className="warn">
            {cell.stories >= 3 ? 'Already at max height.' : 'Cannot afford, or the matching floor pool is empty.'}
          </p>
        )}
        <button className="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="action-panel">
      <p className="hint">Not a legal action.</p>
      <button className="cancel-btn" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
