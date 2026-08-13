import { useState } from 'react';
import type { GameState, PlayerId } from '../types';
import { commercialUnits, currentBuildCost, playerState, residentialUnits } from '../game/engine';
import { AGENDA_INFO } from '../game/constants';

interface Props {
  state: GameState;
}

function PlayerCard({ state, player }: { state: GameState; player: PlayerId }) {
  const p = playerState(state, player);
  const res = residentialUnits(state.board, player);
  const com = commercialUnits(state.board, player);
  const liveVP = res * 1 + com * 2;
  const isCurrent = state.currentPlayer === player && state.phase !== 'ended';
  const [revealed, setRevealed] = useState(false);

  // The screen may be shared by multiple humans (hot-seat), so every human
  // seat's agenda stays hidden behind a self-serve peek toggle. AI agendas
  // are simply never shown during play.
  const canPeek = p.kind === 'human';
  const showAgenda = revealed;

  return (
    <div className={`player-card owner-${player.toLowerCase()}-accent ${isCurrent ? 'active' : ''}`}>
      <h3>
        {p.label} {isCurrent && <span className="turn-badge">Turn</span>}
      </h3>
      <dl>
        <dt>Cash</dt>
        <dd>${p.cash}M</dd>
        <dt>Residential units</dt>
        <dd>{res}</dd>
        <dt>Commercial units</dt>
        <dd>{com}</dd>
        <dt>VP so far</dt>
        <dd title="Tile VP only — secret agenda bonus stays hidden until game end">{liveVP}</dd>
      </dl>
      {showAgenda && (
        <p className="agenda-line">
          Secret agenda: <strong>{AGENDA_INFO[p.agenda].name}</strong>
        </p>
      )}
      {canPeek && !revealed && (
        <button className="peek-btn" onClick={() => setRevealed(true)}>
          Peek my agenda
        </button>
      )}
      {canPeek && revealed && (
        <button className="peek-btn" onClick={() => setRevealed(false)}>
          Hide (pass the device)
        </button>
      )}
    </div>
  );
}

export default function StatusPanel({ state }: Props) {
  return (
    <div className="status-panel">
      {state.playerOrder.map((player) => (
        <PlayerCard key={player} state={state} player={player} />
      ))}
      <div className="pools-card">
        <h3>Floor pools remaining</h3>
        <dl>
          <dt>2F Residential</dt>
          <dd>{state.pools.res2}</dd>
          <dt>2F Commercial</dt>
          <dd>{state.pools.com2}</dd>
          <dt>3F Residential</dt>
          <dd>{state.pools.res3}</dd>
          <dt>3F Commercial</dt>
          <dd>{state.pools.com3}</dd>
        </dl>
      </div>
      <div className="pools-card">
        <h3>Current build price</h3>
        <dl>
          <dt>Residential</dt>
          <dd>${currentBuildCost(state, 'residential')}M</dd>
          <dt>Commercial</dt>
          <dd>${currentBuildCost(state, 'commercial')}M</dd>
        </dl>
        <p className="agenda-detail">
          Rises $1M every {state.playerOrder.length} new builds (either type, any player).
        </p>
      </div>
    </div>
  );
}
