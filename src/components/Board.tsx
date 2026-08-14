import type { Cell, GameState, PlayerId } from '../types';
import { residentialRentMultiplier } from '../game/engine';

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
  return `owner-${owner.toLowerCase()}`;
}

const TILE_LETTER: Record<string, string> = {
  residential: 'R',
  commercial: 'C',
  park: 'P',
};

function cellContent(cell: Cell, board: Cell[][], row: number, col: number) {
  if (cell === 'townhall') {
    return (
      <div className="cell-inner townhall">
        <span className="th-label">Town Hall</span>
      </div>
    );
  }
  if (cell === null) return null;
  const rentMult = cell.type === 'residential' ? residentialRentMultiplier(board, row, col) : 1;
  return (
    <div className={`cell-inner ${ownerClass(cell.owner)} type-${cell.type}`}>
      <span className="tile-type">{TILE_LETTER[cell.type]}</span>
      {cell.type !== 'park' && <span className="story-badge">{cell.stories}</span>}
      {rentMult !== 1 && <span className="rent-badge">×{rentMult}</span>}
    </div>
  );
}

function sizeClass(size: number): string {
  if (size >= 11) return 'board-xl';
  if (size >= 7) return 'board-lg';
  return '';
}

export default function Board({ state, legalSquares, stackableSquares, selectedCell, interactive, onCellClick }: Props) {
  const size = state.board.length;
  return (
    <div className={`board ${sizeClass(size)}`} role="grid" aria-label="City Developers board">
      {Array.from({ length: size }, (_, r) => (
        <div className="board-row" role="row" key={r}>
          {Array.from({ length: size }, (_, c) => {
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
                {cellContent(cell, state.board, r, c)}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
