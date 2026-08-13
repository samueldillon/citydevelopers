import type { Cell, GameState, PlayerId } from '../types';
import { BOARD_SIZE } from '../game/constants';

interface Props {
  state: GameState;
  legalSquares: Set<string>;
  stackableSquares: Set<string>;
  selectedCell: [number, number] | null;
  interactive: boolean;
  onCellClick: (row: number, col: number) => void;
}

function key(r: number, c: number): string {
  return `${r},${c}`;
}

function ownerClass(owner: PlayerId): string {
  return owner === 'P1' ? 'owner-p1' : 'owner-p2';
}

function cellContent(cell: Cell) {
  if (cell === 'townhall') {
    return (
      <div className="cell-inner townhall">
        <span className="th-label">Town Hall</span>
      </div>
    );
  }
  if (cell === null) return null;
  return (
    <div className={`cell-inner ${ownerClass(cell.owner)} type-${cell.type}`}>
      <span className="tile-type">{cell.type === 'residential' ? 'R' : 'C'}</span>
      <span className="story-badge">{cell.stories}</span>
    </div>
  );
}

export default function Board({ state, legalSquares, stackableSquares, selectedCell, interactive, onCellClick }: Props) {
  return (
    <div className="board" role="grid" aria-label="City Developers board">
      {Array.from({ length: BOARD_SIZE }, (_, r) => (
        <div className="board-row" role="row" key={r}>
          {Array.from({ length: BOARD_SIZE }, (_, c) => {
            const cell = state.board[r][c];
            const k = key(r, c);
            const isLegalBuild = legalSquares.has(k);
            const isStackable = stackableSquares.has(k);
            const isSelected = selectedCell && selectedCell[0] === r && selectedCell[1] === c;
            const classes = [
              'board-cell',
              isLegalBuild ? 'legal-build' : '',
              isStackable ? 'legal-stack' : '',
              isSelected ? 'selected' : '',
              interactive && (isLegalBuild || isStackable) ? 'clickable' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={c}
                role="gridcell"
                className={classes}
                onClick={() => onCellClick(r, c)}
                disabled={!interactive || (!isLegalBuild && !isStackable)}
                aria-label={`Row ${r + 1}, Column ${c + 1}`}
              >
                {cellContent(cell)}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
