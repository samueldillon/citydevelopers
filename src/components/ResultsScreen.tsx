import type { GameState, PlayerId } from '../types';
import { playerState } from '../game/engine';
import { AGENDA_INFO } from '../game/constants';

interface Props {
  state: GameState;
  onRestart: () => void;
}

function ScoreCard({ state, player }: { state: GameState; player: PlayerId }) {
  const p = playerState(state, player);
  const score = state.result!.scores[player]!;
  const isWinner = state.result!.winners.includes(player);
  return (
    <div className={`score-card ${isWinner ? 'winner' : ''}`}>
      <h3>
        {p.label} {isWinner && <span className="winner-badge">Winner</span>}
      </h3>
      <dl>
        <dt>Residential units</dt>
        <dd>{score.residentialUnits} → {score.residentialUnits} VP</dd>
        <dt>Commercial units</dt>
        <dd>{score.commercialUnits} → {score.commercialUnits * 2} VP</dd>
        <dt>Secret agenda</dt>
        <dd>
          {AGENDA_INFO[score.agendaResult.agenda].name} — {score.agendaResult.met ? 'Met' : 'Not met'}
          {score.agendaResult.met ? ` (+${score.agendaResult.vp} VP)` : ''}
        </dd>
        <dd className="agenda-detail">{score.agendaResult.detail}</dd>
        <dt>Cash on hand</dt>
        <dd>${score.cash}M</dd>
        <dt>Total VP</dt>
        <dd className="total-vp">{score.totalVP}</dd>
      </dl>
    </div>
  );
}

export default function ResultsScreen({ state, onRestart }: Props) {
  const result = state.result!;
  const winnerLabels = result.winners.map((w) => playerState(state, w).label);
  const headline =
    result.winners.length === 1
      ? `${winnerLabels[0]} wins!`
      : result.winners.length === state.playerOrder.length
        ? "It's a draw!"
        : `${winnerLabels.join(' & ')} tie!`;

  return (
    <div className="results-screen">
      <h1>{headline}</h1>
      <p className="reason">{result.reason}</p>
      <div className="score-cards">
        {state.playerOrder.map((player) => (
          <ScoreCard key={player} state={state} player={player} />
        ))}
      </div>
      <button className="restart-btn" onClick={onRestart}>
        New Game
      </button>
    </div>
  );
}
