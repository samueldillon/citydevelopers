import type { GameState, PlayerId } from '../types';
import { currentBuildCost, playerState, scoreBreakdownFor, upkeepCost } from '../game/engine';
import { AGENDA_INFO, priceTierBuilds } from '../game/constants';

interface Props {
  state: GameState;
}

function PlayerCard({ state, player }: { state: GameState; player: PlayerId }) {
  const p = playerState(state, player);
  const score = scoreBreakdownFor(state, player);
  const isCurrent = state.currentPlayer === player && state.phase !== 'ended';
  const upkeep = upkeepCost(state.board, player);

  return (
    <div className={`player-card owner-${player.toLowerCase()}-accent ${isCurrent ? 'active' : ''}`}>
      <h3>
        {p.label} {isCurrent && <span className="turn-badge">Turn</span>}
      </h3>
      <dl>
        <dt>Cash</dt>
        <dd>${p.cash}M</dd>
        <dt title="Charged per tile owned beyond the first 2, at the end of this player's turn, netted against income">
          Upkeep
        </dt>
        <dd>{upkeep > 0 ? `-$${upkeep}M/turn` : '$0M/turn'}</dd>
        <dt>Residential units</dt>
        <dd>{score.residentialUnits}</dd>
        <dt>Commercial units</dt>
        <dd>{score.commercialUnits}</dd>
        <dt>Park units</dt>
        <dd>{score.parkUnits}</dd>
        <dt>VP so far</dt>
        <dd title="Includes any agenda bonuses currently met — recalculated live, not locked in until game end">
          {score.totalVP}
        </dd>
      </dl>
      <ul className="agenda-progress">
        {score.agendaResults.map((r) => (
          <li key={r.agenda} className={r.met ? 'met' : ''}>
            {AGENDA_INFO[r.agenda].name}
            {r.met ? ` — met (+${r.vp})` : ''}
          </li>
        ))}
      </ul>
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
          <dt>Park</dt>
          <dd>${currentBuildCost(state, 'park')}M</dd>
        </dl>
        <p className="agenda-detail">
          Rises $1M every {priceTierBuilds(state.board.length, state.playerOrder.length)} new builds (either
          type, any player).
        </p>
      </div>
    </div>
  );
}
