import { useState } from 'react';
import type { GameState } from '../types';
import { playerState } from '../game/engine';
import { STACK_COST } from '../game/constants';

interface Props {
  state: GameState;
  onSubmitBid: (amount: number) => void;
}

export default function AuctionPanel({ state, onSubmitBid }: Props) {
  const auction = state.auction!;
  const bidderId = auction.eligibleBidders[auction.nextBidderIndex];
  const bidder = playerState(state, bidderId);
  const floor = STACK_COST[3];
  const [amount, setAmount] = useState(floor);

  const submittedCount = auction.nextBidderIndex;
  const totalCount = auction.eligibleBidders.length;

  return (
    <div className="action-panel auction-panel">
      <p className="hint">
        Blind auction for a 3rd floor {auction.tileType} tile — started by{' '}
        {playerState(state, auction.initiator).label}.
      </p>
      <p className="hint">
        {submittedCount} of {totalCount} bids in. Now bidding: <strong>{bidder.label}</strong>
      </p>
      <label className="bid-input-row">
        Bid ($M, min {floor}, you have ${bidder.cash}M)
        <input
          type="number"
          min={floor}
          max={bidder.cash}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
      </label>
      <button
        onClick={() => onSubmitBid(Math.max(floor, Math.min(amount, bidder.cash)))}
        disabled={bidder.cash < floor}
      >
        Submit bid
      </button>
      {bidder.cash < floor && <p className="warn">Not enough cash to bid — this shouldn't happen.</p>}
    </div>
  );
}
