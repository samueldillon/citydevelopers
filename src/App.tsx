import { useEffect, useState } from 'react';
import type { GameState, SeatConfig, TileType } from './types';
import {
  applyAction,
  applyBuild,
  applyPass,
  applyStack,
  createInitialState,
  legalBuildActions,
  legalSetupSquares,
  legalStackActions,
  placeSetupTile,
  playerState,
} from './game/engine';
import { chooseAiAction, chooseAiSetupSquare } from './game/ai';
import GameSetup from './components/GameSetup';
import Board from './components/Board';
import StatusPanel from './components/StatusPanel';
import ActionPanel from './components/ActionPanel';
import ResultsScreen from './components/ResultsScreen';
import { AGENDA_INFO } from './game/constants';
import './App.css';

function key(r: number, c: number): string {
  return `${r},${c}`;
}

export default function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null);

  // Drive AI turns automatically, both during setup placement and normal play.
  useEffect(() => {
    if (!state || state.phase === 'ended') return;
    const active = playerState(state, state.currentPlayer);
    if (active.kind !== 'ai') return;

    const timer = setTimeout(() => {
      setState((prev) => {
        if (!prev || prev.phase === 'ended') return prev;
        if (playerState(prev, prev.currentPlayer).kind !== 'ai') return prev;
        if (prev.phase === 'setup') {
          const [r, c] = chooseAiSetupSquare(prev);
          return placeSetupTile(prev, r, c);
        }
        const action = chooseAiAction(prev, prev.currentPlayer);
        return applyAction(prev, action);
      });
    }, 550);
    return () => clearTimeout(timer);
  }, [state]);

  if (!state) {
    return (
      <GameSetup
        onStart={(seats: SeatConfig[]) => {
          setState(createInitialState(seats));
          setSelectedCell(null);
        }}
      />
    );
  }

  const humanTurn = state.phase !== 'ended' && playerState(state, state.currentPlayer).kind === 'human';

  const legalSquares = new Set<string>();
  const stackableSquares = new Set<string>();
  if (humanTurn) {
    if (state.phase === 'setup') {
      legalSetupSquares(state).forEach(([r, c]) => legalSquares.add(key(r, c)));
    } else if (state.phase === 'playing') {
      legalBuildActions(state, state.currentPlayer).forEach((a) => legalSquares.add(key(a.row, a.col)));
      legalStackActions(state, state.currentPlayer).forEach((a) => stackableSquares.add(key(a.row, a.col)));
    }
  }

  function handleCellClick(row: number, col: number) {
    if (!state) return;
    if (state.phase === 'setup') {
      setState(placeSetupTile(state, row, col));
      return;
    }
    if (state.phase === 'playing') {
      setSelectedCell([row, col]);
    }
  }

  function handleBuild(tileType: TileType) {
    if (!state || !selectedCell) return;
    const [row, col] = selectedCell;
    setState(applyBuild(state, row, col, tileType));
    setSelectedCell(null);
  }

  function handleStack() {
    if (!state || !selectedCell) return;
    const [row, col] = selectedCell;
    setState(applyStack(state, row, col));
    setSelectedCell(null);
  }

  function handlePass() {
    if (!state) return;
    setState(applyPass(state));
    setSelectedCell(null);
  }

  const currentLabel = playerState(state, state.currentPlayer).label;
  const stepText =
    state.phase === 'setup'
      ? `Setup — ${currentLabel} places a residential tile ${
          state.setupStep < state.playerOrder.length
            ? 'adjacent to Town Hall'
            : 'adjacent to Town Hall or their own tile'
        }.`
      : state.phase === 'playing'
        ? `${currentLabel}'s turn`
        : 'Game over';

  return (
    <div className="app">
      <header className="app-header">
        <h1>City Developers</h1>
        <p className="turn-indicator">{stepText}</p>
      </header>

      {state.phase !== 'ended' && (
        <div className="game-layout">
          <StatusPanel state={state} />
          <div className="board-column">
            <Board
              state={state}
              legalSquares={legalSquares}
              stackableSquares={stackableSquares}
              selectedCell={selectedCell}
              interactive={humanTurn}
              onCellClick={handleCellClick}
            />
            {!humanTurn && <p className="ai-thinking">Computer is thinking…</p>}
            {state.phase === 'playing' && humanTurn && (
              <ActionPanel
                state={state}
                selectedCell={selectedCell}
                onBuild={handleBuild}
                onStack={handleStack}
                onCancel={() => setSelectedCell(null)}
                onPass={handlePass}
                canPass={humanTurn}
              />
            )}
          </div>
          <details className="rules-summary">
            <summary>Quick rules reference</summary>
            <ul>
              <li>
                Build: Residential $1M / Commercial $2M base price, must be adjacent to Town Hall or one of your
                own tiles — you can't piggyback on another player's development.
              </li>
              <li>
                New-build prices rise as the game goes: every N new builds (N = player count, either type, any
                player) adds $1M to both types' price, for the rest of the game. Stacking costs stay fixed.
              </li>
              <li>
                Every tile you own needs a resident behind it: your total residential units (stories) must cover
                your total tile count. Residential builds are self-covering, so this only ever gates commercial —
                stack a residential tile to free up capacity before building commercial.
              </li>
              <li>Stack: 2nd floor $2M, 3rd floor $3M, matching type, drawn from the shared pool.</li>
              <li>
                Income: at the end of your own turn (build, stack, or pass), you collect $1M per residential
                unit + $2M per commercial unit you own — not on other players' turns.
              </li>
              <li>Game ends when the board is completely full, or every player passes in a row.</li>
              <li>Scoring: 1 VP/residential unit, 2 VP/commercial unit, plus your secret agenda bonus.</li>
              <ul>
                {Object.values(AGENDA_INFO).map((a) => (
                  <li key={a.name}>
                    <strong>{a.name}</strong> (+{a.vp} VP): {a.description}
                  </li>
                ))}
              </ul>
            </ul>
          </details>
        </div>
      )}

      {state.phase === 'ended' && <ResultsScreen state={state} onRestart={() => setState(null)} />}
    </div>
  );
}
