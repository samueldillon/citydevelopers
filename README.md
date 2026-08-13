# City Developers — Digital Prototype

A playtesting web app for **City Developers**, an area-control board game, for 2-4 players. Built for quickly testing rules changes — prioritizes a correct, playable ruleset over visual polish. No backend: all state is in-memory for the duration of a single session.

## Setup flow

Choose a player count (2-4). 2-player games always use the original 5x5 board; 3-4 player games pick between a 7x7 or 11x11 city so there's more room to develop. Then toggle each seat between Human and Computer independently — any mix works, including hot-seat-only, all-computer (spectator), or a human against several AI opponents. Turn order is randomized at the start of every game. The AI always makes a legal move; it isn't tuned to play well, just to play validly and lean a little toward all four agenda-friendly patterns at once.

## Running locally

```bash
npm install
npm run dev
```

Then open the printed local URL. `npm run build` produces a static production build in `dist/`; `npm run lint` runs Oxlint.

## Rules implemented

- Board: 5x5 for 2 players, or 7x7 / 11x11 (your choice) for 3-4 players. Permanent neutral Town Hall at center, with exactly 4 orthogonal neighbors on any size board — one per player at 4-player games. Floor pools scale proportionally to buildable-square count on larger boards, so scarcity stays meaningful.
- Setup: every player places 2 free residential tiles, two rounds through turn order — round 1 each player's tile must be adjacent to Town Hall, round 2 each player's tile must be adjacent to Town Hall or their own first tile.
- Every build must be orthogonally adjacent to Town Hall or a tile that player already owns — you can only grow your own footprint, not build off another player's tiles.
- One action per turn: build (Residential $1M / Commercial $2M base price), stack a floor on your own tile, or pass.
- Build prices escalate: every N new builds (N = active player count, either type, any player, combined) adds $1M to both types' price, uncapped for the rest of the game. Tying the tier size to the player count means each price bracket gives every player an equal shot at it regardless of turn order. Stacking costs are unaffected — this only paces new-tile expansion, as a brake on the income snowball.
- Stacking to a 2nd floor is a flat $2M, drawn from a shared, type-specific pool. Stacking to a **3rd floor is auctioned**: wanting one triggers a blind auction among every player who currently has an eligible tile of that type and can afford the $3M floor. Bidding is sealed, in turn order starting with whoever initiated it; the highest bid wins (replacing the flat cost, $3M minimum) and immediately places it on one of their own eligible tiles — it can't be banked for later. Turn order then simply continues as normal from whoever initiated the auction; winning it doesn't grant an extra turn.
- Residential capacity: every tile you own needs a resident behind it. Your total residential units (stories) must be at least your total tile count (residential + commercial squares owned). Residential builds are self-covering (they add one unit and one tile at once), so this only ever gates commercial — you need spare residential capacity, typically from stacking, before building a new commercial tile.
- Income collected at the end of your own turn only (build, stack, pass, or an auction you initiated all count): $1M per residential unit + $2M per commercial unit you own. Other players don't collect on your turn.
- Game ends when the board is completely full, or every player passes in a row (a full round with nobody acting).
- Scoring: 1 VP/residential unit, 2 VP/commercial unit, plus a bonus for every agenda a player wins at game end (Land Lord, Central Business District, Low Rise, Suburbs — see in-app "Quick rules reference"). Agendas are open, public objectives available to any player, and one player can win several at once — there's no secret dealing. Each agenda has exactly one winner, no ties: Land Lord and Central Business District have no minimum, so whoever's highest wins outright; Low Rise and Suburbs still gate on their numeric floor (4+ / 3+), and the highest among players who clear it wins (nobody wins if nobody clears it). A tie on an agenda's metric breaks on cash on hand, then turn order, so there's always exactly one winner once someone qualifies. Ties on final VP break on cash on hand; if still tied, those players share the win.

Live agenda progress shows on each player's card during play (recalculated as the board changes, not locked in until game end), and the win screen breaks down all four for every player alongside the final board.

## Assumptions flagged during implementation

The source rules text had a couple of points that admit more than one reading; these were resolved as follows (revisit if they don't match design intent):

- **Central Business District — cluster metric**: scored by total commercial units (stories) in a player's largest connected commercial cluster, not tile count, and with no minimum height requirement — the largest cluster wins outright, same as Land Lord.
- **Live VP display**: since agendas are public/open rather than secretly dealt, the "VP so far" stat includes any agenda bonuses currently met — there's no longer hidden information to protect.
- **3-4 player generalization**: the source rules are written for exactly 2 players. Turn order, agenda dealing, price-tier sizing, and the "everyone passes" end condition all generalize by treating "the opponent" as "every other active player."
- **Auction tile assignment**: any eligible player can win a 3rd-floor auction, not just whoever initiated it — the winner places on one of their own eligible tiles, which may be a different tile (or player) than what started the auction.
- **Auction bidder eligibility**: only players who already have an eligible tile of the matching type *and* can afford the $3M floor may bid — nobody can win an auction they can't actually use.
- **Pool scaling on larger boards**: floor pool sizes (tuned for the original 5x5's 24 buildable squares) scale proportionally to buildable-square count on 7x7/11x11 boards, rounded to the nearest whole tile.
