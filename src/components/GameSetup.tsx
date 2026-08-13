import { useState } from 'react';
import type { SeatConfig } from '../types';
import { MAX_PLAYERS, MIN_PLAYERS } from '../game/constants';

interface Props {
  onStart: (seats: SeatConfig[]) => void;
}

const PLAYER_COUNTS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

export default function GameSetup({ onStart }: Props) {
  const [seats, setSeats] = useState<SeatConfig[]>([{ kind: 'human' }, { kind: 'ai' }]);

  function setPlayerCount(count: number) {
    setSeats((prev) => {
      const next = prev.slice(0, count);
      while (next.length < count) next.push({ kind: 'ai' });
      return next;
    });
  }

  function toggleSeat(index: number) {
    setSeats((prev) => prev.map((s, i) => (i === index ? { kind: s.kind === 'human' ? 'ai' : 'human' } : s)));
  }

  return (
    <div className="mode-select">
      <h1>City Developers</h1>
      <p className="subtitle">
        A 2-4 player area-control prototype — 5x5 board, secret agendas, escalating prices.
      </p>

      <div className="setup-section">
        <h2>Players</h2>
        <div className="count-picker">
          {PLAYER_COUNTS.map((count) => (
            <button
              key={count}
              className={count === seats.length ? 'count-btn active' : 'count-btn'}
              onClick={() => setPlayerCount(count)}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      <div className="setup-section">
        <h2>Seats</h2>
        <div className="seat-list">
          {seats.map((seat, i) => (
            <button key={i} className={`seat-toggle ${seat.kind}`} onClick={() => toggleSeat(i)}>
              <span className="seat-number">Seat {i + 1}</span>
              <span className="seat-kind">{seat.kind === 'human' ? 'Human' : 'Computer'}</span>
            </button>
          ))}
        </div>
        <p className="hint">Click a seat to toggle Human / Computer. Turn order is randomized at start.</p>
      </div>

      <button className="start-btn" onClick={() => onStart(seats)}>
        Start Game
      </button>
    </div>
  );
}
