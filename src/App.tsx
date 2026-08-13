import { useEffect, useState } from 'react';
import type { GameMode, GameState, TileType } from './types';
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
} from './game/engine';
import { chooseAiAction, chooseAiSetupSquare } from './game/ai';
import ModeSelect from './components/ModeSelect';
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
    const active = state.players[state.currentPlayer];
    if (active.kind !== 'ai') return;

    const timer = setTimeout(() => {
      setState((prev) => {
        if (!prev || prev.phase === 'ended') return prev;
        if (prev.players[prev.currentPlayer].kind !== 'ai') return prev;
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
      <ModeSelect
        onSelect={(mode: GameMode) => {
          setState(createInitialState(mode));
          setSelectedCell(null);
        }}
      />
    );
  }

  const humanTurn = state.phase !== 'ended' && state.players[state.currentPlayer].kind === 'human';

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

  const currentLabel = state.players[state.currentPlayer].label;
  const stepText =
    state.phase === 'setup'
      ? `Setup — ${currentLabel} places a residential tile ${
          state.setupStep < 2 ? 'adjacent to Town Hall' : 'adjacent to any existing tile'
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
              <li>Build: Residential $1M / Commercial $2M, must be adjacent to an existing tile.</li>
              <li>Stack: 2nd floor $2M, 3rd floor $3M, matching type, drawn from the shared pool.</li>
              <li>Income each turn: $1M per residential unit + $2M per commercial unit you own.</li>
              <li>Game ends when the board locks up or both players pass in a row.</li>
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
