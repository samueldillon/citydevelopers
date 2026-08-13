import { useEffect, useState } from 'react';
import type { GameState, SeatConfig, TileType } from './types';
import {
  applyAction,
  applyAuctionPlacement,
  applyBuild,
  applyPass,
  applyStack,
  createInitialState,
  currentAuctionBidder,
  eligibleAuctionPlacementSquares,
  initiateAuction,
  legalBuildActions,
  legalSetupSquares,
  legalStackActions,
  placeSetupTile,
  playerState,
  submitAuctionBid,
} from './game/engine';
import { chooseAiAction, chooseAiAuctionPlacement, chooseAiBid, chooseAiSetupSquare } from './game/ai';
import GameSetup from './components/GameSetup';
import Board from './components/Board';
import StatusPanel from './components/StatusPanel';
import ActionPanel from './components/ActionPanel';
import AuctionPanel from './components/AuctionPanel';
import ResultsScreen from './components/ResultsScreen';
import { AGENDA_INFO } from './game/constants';
import './App.css';

function key(r: number, c: number): string {
  return `${r},${c}`;
}

export default function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null);

  // Drive AI turns automatically: normal setup/build turns, plus auction
  // bidding and auction placement, whichever the current game state needs.
  useEffect(() => {
    if (!state || state.phase === 'ended') return;

    if (state.phase === 'auction' && state.auction) {
      const bidderId = currentAuctionBidder(state);
      if (bidderId && playerState(state, bidderId).kind === 'ai') {
        const timer = setTimeout(() => {
          setState((prev) => {
            if (!prev || prev.phase !== 'auction' || !prev.auction) return prev;
            const b = currentAuctionBidder(prev);
            if (!b || playerState(prev, b).kind !== 'ai') return prev;
            return submitAuctionBid(prev, b, chooseAiBid(prev, b));
          });
        }, 500);
        return () => clearTimeout(timer);
      }
      if (state.auction.stage === 'placing' && state.auction.winner) {
        const winnerId = state.auction.winner;
        if (playerState(state, winnerId).kind === 'ai') {
          const timer = setTimeout(() => {
            setState((prev) => {
              if (!prev || prev.phase !== 'auction' || !prev.auction || prev.auction.stage !== 'placing') {
                return prev;
              }
              const w = prev.auction.winner;
              if (!w || playerState(prev, w).kind !== 'ai') return prev;
              const [r, c] = chooseAiAuctionPlacement(prev);
              return applyAuctionPlacement(prev, r, c);
            });
          }, 500);
          return () => clearTimeout(timer);
        }
      }
      return;
    }

    const active = playerState(state, state.currentPlayer);
    if (active.kind !== 'ai') return;

    const timer = setTimeout(() => {
      setState((prev) => {
        if (!prev || prev.phase === 'ended' || prev.phase === 'auction') return prev;
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
        onStart={(seats: SeatConfig[], boardSize: number) => {
          setState(createInitialState(seats, boardSize));
          setSelectedCell(null);
        }}
      />
    );
  }

  const humanTurn =
    (state.phase === 'setup' || state.phase === 'playing') &&
    playerState(state, state.currentPlayer).kind === 'human';

  const auctionBidderId = state.phase === 'auction' ? currentAuctionBidder(state) : null;
  const auctionWinnerId =
    state.phase === 'auction' && state.auction?.stage === 'placing' ? (state.auction.winner ?? null) : null;
  const activeAuctionParticipant = auctionBidderId ?? auctionWinnerId;
  const auctionParticipantIsHuman = activeAuctionParticipant
    ? playerState(state, activeAuctionParticipant).kind === 'human'
    : false;

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
  if (state.phase === 'auction' && state.auction?.stage === 'placing' && auctionParticipantIsHuman) {
    eligibleAuctionPlacementSquares(state).forEach(([r, c]) => stackableSquares.add(key(r, c)));
  }

  const boardInteractive =
    humanTurn || (state.phase === 'auction' && state.auction?.stage === 'placing' && auctionParticipantIsHuman);

  function handleCellClick(row: number, col: number) {
    if (!state) return;
    if (state.phase === 'setup') {
      setState(placeSetupTile(state, row, col));
      return;
    }
    if (state.phase === 'auction' && state.auction?.stage === 'placing') {
      setState(applyAuctionPlacement(state, row, col));
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

  function handleStartAuction() {
    if (!state || !selectedCell) return;
    const [row, col] = selectedCell;
    setState(initiateAuction(state, row, col));
    setSelectedCell(null);
  }

  function handlePass() {
    if (!state) return;
    setState(applyPass(state));
    setSelectedCell(null);
  }

  function handleSubmitBid(amount: number) {
    if (!state || !auctionBidderId) return;
    setState(submitAuctionBid(state, auctionBidderId, amount));
  }

  const currentLabel = playerState(state, state.currentPlayer).label;
  const stepText =
    state.phase === 'setup'
      ? `Setup — ${currentLabel} places a residential tile ${
          state.setupStep < state.playerOrder.length
            ? 'adjacent to Town Hall'
            : 'adjacent to Town Hall or their own tile'
        }.`
      : state.phase === 'auction'
        ? state.auction?.stage === 'bidding'
          ? `Blind auction for a 3rd floor ${state.auction.tileType} tile — bidding in progress.`
          : `${playerState(state, state.auction!.winner!).label} won the auction — placing their 3rd floor.`
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
              interactive={boardInteractive}
              onCellClick={handleCellClick}
            />
            {(state.phase === 'setup' || state.phase === 'playing') && !humanTurn && (
              <p className="ai-thinking">Computer is thinking…</p>
            )}
            {state.phase === 'auction' && !auctionParticipantIsHuman && activeAuctionParticipant && (
              <p className="ai-thinking">
                {playerState(state, activeAuctionParticipant).label}
                {state.auction?.stage === 'bidding' ? ' is bidding…' : ' is placing their 3rd floor…'}
              </p>
            )}
            {state.phase === 'playing' && humanTurn && (
              <ActionPanel
                state={state}
                selectedCell={selectedCell}
                onBuild={handleBuild}
                onStack={handleStack}
                onStartAuction={handleStartAuction}
                onCancel={() => setSelectedCell(null)}
                onPass={handlePass}
                canPass={humanTurn}
              />
            )}
            {state.phase === 'auction' && state.auction?.stage === 'bidding' && auctionParticipantIsHuman && (
              <AuctionPanel state={state} onSubmitBid={handleSubmitBid} />
            )}
            {state.phase === 'auction' && state.auction?.stage === 'placing' && auctionParticipantIsHuman && (
              <div className="action-panel auction-panel">
                <p className="hint">
                  You won the auction for ${state.auction.winningBid}M! Click one of your highlighted tiles to
                  place your 3rd floor.
                </p>
              </div>
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
                New-build prices rise as the game goes: every N new builds (N scales with player count and board
                size — see the status panel for the current number) adds $1M to both types' price, for the rest
                of the game. Stacking costs stay fixed.
              </li>
              <li>
                Every tile you own needs a resident behind it: your total residential units (stories) must cover
                your total tile count. Residential builds are self-covering, so this only ever gates commercial —
                stack a residential tile to free up capacity before building commercial.
              </li>
              <li>Stack: 2nd floor $2M flat. 3rd floor is scarce — wanting one triggers a blind auction among
                every player with an eligible tile of that type: everyone bids sealed in turn order starting
                with whoever started it, highest bid wins (min $3M) and places immediately on one of their own
                eligible tiles. Play then continues normally from whoever started the auction.</li>
              <li>
                Income: at the end of your own turn (build, stack, pass, or an auction you started), you collect
                $1M per residential unit + $2M per commercial unit you own — not on other players' turns.
              </li>
              <li>Game ends when the board is completely full, or every player passes in a row.</li>
              <li>
                Scoring: 1 VP/residential unit, 2 VP/commercial unit, plus a bonus for every agenda below you
                win at game end — they're open to any player, and one player can win several at once. Each
                agenda has exactly one winner (whoever's highest on its metric); ties break on cash on hand,
                then turn order. Live progress toward each shows on your player card as you play.
              </li>
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
