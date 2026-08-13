import type { GameState, TileType } from '../types';
import { legalBuildActions, legalStackActions } from '../game/engine';
import { BUILD_COST } from '../game/constants';

interface Props {
  state: GameState;
  selectedCell: [number, number] | null;
  onBuild: (tileType: TileType) => void;
  onStack: () => void;
  onCancel: () => void;
  onPass: () => void;
  canPass: boolean;
}

export default function ActionPanel({ state, selectedCell, onBuild, onStack, onCancel, onPass, canPass }: Props) {
  const player = state.currentPlayer;
  const cash = state.players[player].cash;

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
    return (
      <div className="action-panel">
        <p className="hint">
          Build at ({row + 1}, {col + 1}):
        </p>
        <button disabled={!canResidential} onClick={() => onBuild('residential')}>
          Residential — ${BUILD_COST.residential}M
        </button>
        <button disabled={!canCommercial} onClick={() => onBuild('commercial')}>
          Commercial — ${BUILD_COST.commercial}M
        </button>
        <button className="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
        {cash < BUILD_COST.residential && <p className="warn">Not enough cash to build here.</p>}
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
        {stack ? (
          <button onClick={onStack}>
            Add {stack.nextStory === 2 ? '2nd' : '3rd'} floor — ${stack.cost}M
          </button>
        ) : (
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
