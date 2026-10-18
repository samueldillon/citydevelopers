import type { GameState } from '../types';
import { playerState } from '../game/engine';

interface Props {
  state: GameState;
}

// Shown once a blind auction's bidding closes (the 'placing' stage) — every
// bid was sealed during bidding, but there's no reason to keep them secret
// once the winner is decided, so this reveals the full breakdown to everyone
// watching, not just the winner.
export default function AuctionBids({ state }: Props) {
  const auction = state.auction;
  if (!auction) return null;

  const bidders = [...auction.eligibleBidders].sort((a, b) => (auction.bids[b] ?? 0) - (auction.bids[a] ?? 0));

  return (
    <div className="action-panel auction-panel auction-bids">
      <p className="hint">Bids revealed — 3rd floor {auction.tileType} tile:</p>
      <ul className="auction-bids-list">
        {bidders.map((p) => (
          <li key={p} className={p === auction.winner ? 'winner' : ''}>
            <span>{playerState(state, p).label}</span>
            <span>
              ${auction.bids[p]}M{p === auction.winner ? ' — winner' : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
