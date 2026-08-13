import type { GameMode } from '../types';

interface Props {
  onSelect: (mode: GameMode) => void;
}

export default function ModeSelect({ onSelect }: Props) {
  return (
    <div className="mode-select">
      <h1>City Developers</h1>
      <p className="subtitle">A 2-player area-control prototype — 5x5 board, secret agendas, income &amp; income races.</p>
      <div className="mode-cards">
        <button className="mode-card" onClick={() => onSelect('hotseat')}>
          <h2>Two Computers</h2>
          <p>Pass-and-play. Two humans share this screen and alternate turns.</p>
        </button>
        <button className="mode-card" onClick={() => onSelect('pvc')}>
          <h2>Player vs Computer</h2>
          <p>You play against a basic AI opponent. Its secret agenda stays hidden until scoring.</p>
        </button>
      </div>
    </div>
  );
}
