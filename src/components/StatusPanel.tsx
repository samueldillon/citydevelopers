import { useState } from 'react';
import type { GameState, PlayerId } from '../types';
import { commercialUnits, currentBuildCost, residentialUnits } from '../game/engine';
import { AGENDA_INFO } from '../game/constants';

interface Props {
  state: GameState;
}

function PlayerCard({ state, player }: { state: GameState; player: PlayerId }) {
  const p = state.players[player];
  const res = residentialUnits(state.board, player);
  const com = commercialUnits(state.board, player);
  const liveVP = res * 1 + com * 2;
  const isCurrent = state.currentPlayer === player && state.phase !== 'ended';
  const [revealed, setRevealed] = useState(false);

  const canPeek = state.mode === 'hotseat' && p.kind === 'human';
  const showAgenda = state.mode === 'pvc' ? p.kind === 'human' : revealed;

  return (
    <div className={`player-card ${isCurrent ? 'active' : ''}`}>
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
      <PlayerCard state={state} player="P1" />
      <PlayerCard state={state} player="P2" />
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
        <p className="agenda-detail">Rises $1M every 2 new builds (either type, either player).</p>
      </div>
    </div>
  );
}
