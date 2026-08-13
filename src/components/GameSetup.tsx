import { useState } from 'react';
import type { SeatConfig } from '../types';
import { BOARD_SIZE_2P, BOARD_SIZE_OPTIONS_MULTIPLAYER, MAX_PLAYERS, MIN_PLAYERS } from '../game/constants';

interface Props {
  onStart: (seats: SeatConfig[], boardSize: number) => void;
}

const PLAYER_COUNTS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

export default function GameSetup({ onStart }: Props) {
  const [seats, setSeats] = useState<SeatConfig[]>([{ kind: 'human' }, { kind: 'ai' }]);
  const [boardSize, setBoardSize] = useState<number>(BOARD_SIZE_OPTIONS_MULTIPLAYER[0]);

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

  const showBoardSizePicker = seats.length > 2;
  const effectiveBoardSize = showBoardSizePicker ? boardSize : BOARD_SIZE_2P;

  return (
    <div className="mode-select">
      <h1>City Developers</h1>
      <p className="subtitle">
        A 2-4 player area-control prototype — open agenda bonuses anyone can chase, escalating prices, blind
        auctions for 3rd floors.
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

      {showBoardSizePicker && (
        <div className="setup-section">
          <h2>City size</h2>
          <div className="count-picker">
            {BOARD_SIZE_OPTIONS_MULTIPLAYER.map((size) => (
              <button
                key={size}
                className={size === boardSize ? 'count-btn active' : 'count-btn'}
                onClick={() => setBoardSize(size)}
              >
                {size}x{size}
              </button>
            ))}
          </div>
          <p className="hint">More players get more room to build. 2-player games always use the original 5x5.</p>
        </div>
      )}

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

      <button className="start-btn" onClick={() => onStart(seats, effectiveBoardSize)}>
        Start Game
      </button>
    </div>
  );
}
