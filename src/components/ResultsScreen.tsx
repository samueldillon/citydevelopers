import type { GameState, PlayerId } from '../types';
import { playerState } from '../game/engine';
import { AGENDA_INFO } from '../game/constants';
import Board from './Board';

const EMPTY_SET = new Set<string>();
const NOOP = () => {};

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
        <dt>Park units</dt>
        <dd>{score.parkUnits} → {score.parkUnits * 5} VP</dd>
        <dt>Agenda bonus</dt>
        <dd>{score.agendaVP} VP</dd>
        <dt>Cash on hand</dt>
        <dd>${score.cash}M</dd>
        <dt>Total VP</dt>
        <dd className="total-vp">{score.totalVP}</dd>
      </dl>
      <ul className="results-agenda-list">
        {score.agendaResults.map((r) => (
          <li key={r.agenda} className={r.met ? 'met' : ''}>
            <strong>
              {AGENDA_INFO[r.agenda].name} — {r.met ? `Met (+${r.vp} VP)` : 'Not met'}
            </strong>
            <span className="agenda-detail">{r.detail}</span>
          </li>
        ))}
      </ul>
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

      <div className="results-board-column">
        <Board
          state={state}
          legalSquares={EMPTY_SET}
          stackableSquares={EMPTY_SET}
          selectedCell={null}
          interactive={false}
          onCellClick={NOOP}
        />
        <div className="legend">
          {state.playerOrder.map((player) => (
            <span key={player} className="legend-item">
              <span className={`legend-swatch owner-${player.toLowerCase()}-accent`} />
              {playerState(state, player).label}
            </span>
          ))}
        </div>
      </div>

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
