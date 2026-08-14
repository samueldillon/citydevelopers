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
- One action per turn: build (Residential $1M / Commercial $2M / Park $3M base price), stack a floor on your own tile, or pass.
- Build prices escalate: every N new builds (any of the three types, any player, combined) adds $1M to all three types' price, uncapped for the rest of the game. N scales with both player count (every price bracket gives each player an equal shot at it) and board size (so a bigger board's much higher total build count doesn't rack up far more tiers than a 5x5 game would — see Balance notes below). Stacking costs are unaffected — this only paces new-tile expansion, as a brake on the income snowball.
- Stacking to a 2nd floor is a flat $2M, drawn from a shared, type-specific pool. Stacking to a **3rd floor is auctioned**: wanting one triggers a blind auction among every player who currently has an eligible tile of that type and can afford the $3M floor. Bidding is sealed, in turn order starting with whoever initiated it; the highest bid wins (replacing the flat cost, $3M minimum) and immediately places it on one of their own eligible tiles — it can't be banked for later. Turn order then simply continues as normal from whoever initiated the auction; winning it doesn't grant an extra turn. **Parks never stack** — they're always single-story.
- Residential capacity: every tile you own needs a resident behind it. Your total residential units (stories) must be at least your total tile count (residential + commercial + park squares owned). Residential builds are self-covering (they add one unit and one tile at once), so this only ever gates commercial and park builds — you need spare residential capacity, typically from stacking, before building either.
- Income collected at the end of your own turn only (build, stack, pass, or an auction you initiated all count): $1M per residential unit + $2M per commercial unit you own. **Parks earn no income at all.** Other players don't collect on your turn.
- **Adjacency rent modifiers**: a residential tile's rent is doubled for every park orthogonally adjacent to it, and halved for every adjacent commercial tile — regardless of who owns the neighboring tile. These stack multiplicatively across every adjacent tile (two adjacent parks = 4x rent) and cancel out when both are present (one park + one commercial neighbor = back to 1x). Applied per-story (scales the tile's full stories-based income) and floored to the nearest whole $M. The board shows a ×N badge on any residential tile whose rent is currently modified.
- Game ends when the board is completely full, or every player passes in a row (a full round with nobody acting).
- Scoring: 1 VP/residential unit, 2 VP/commercial unit, **5 VP/park**, plus a bonus for every agenda a player wins at game end (Land Lord, Central Business District, Low Rise, Suburbs, **Urban Jungle** — see in-app "Quick rules reference"). Agendas are open, public objectives available to any player, and one player can win several at once — there's no secret dealing. Each agenda has exactly one winner, no ties: Land Lord, Central Business District, and Urban Jungle have no minimum, so whoever's highest wins outright; Low Rise and Suburbs still gate on their numeric floor (4+ / 3+), and the highest among players who clear it wins (nobody wins if nobody clears it). A tie on an agenda's metric breaks on cash on hand, then turn order, so there's always exactly one winner once someone qualifies. Ties on final VP break on cash on hand; if still tied, those players share the win.

Live agenda progress shows on each player's card during play (recalculated as the board changes, not locked in until game end), and the win screen breaks down all four for every player alongside the final board.

## Balance notes (from instrumented playtests)

Ran several all-AI games at each configuration and inspected final build prices, cash, and auction prices directly from game state to sanity-check the economy:

- **Found and fixed**: the price-escalation tier was sized to player count only, not board size. Since a bigger board needs proportionally more total builds to fill, this let prices spiral out of control on larger boards — an 11x11 4-player game reached a $29M residential / $30M commercial price by the end (from a $1M/$2M base), with cash balances over $2B. Fixed by scaling the tier size by board size the same way pool sizes already were. After the fix, the same configuration tops out around $6-7M by endgame — in line with the 5x5 baseline (~$11M/$12M, unchanged) and the 7x7 case (~$8M/$9M).
- **Still elevated, and flagged rather than changed**: even after the fix, cash balances by endgame are still large in absolute terms (hundreds of millions on 7x7, up to ~$1B on 11x11) because longer games with more players naturally mean more income-collection turns. This doesn't seem to break anything mechanically — relative standings between players stay meaningful, and 3rd-floor auction bids (driven by spare cash, uncapped) absorb a good chunk of the excess, sometimes reaching $100-300M for a single tile late in an 11x11 game. Whether that's thematically fine for a prototype or worth constraining (e.g., capping auction bids, or trimming the income rate further) is a judgment call rather than a bug — flagging it here rather than making that call unilaterally.

## Assumptions flagged during implementation

The source rules text had a couple of points that admit more than one reading; these were resolved as follows (revisit if they don't match design intent):

- **Central Business District — cluster metric**: scored by total commercial units (stories) in a player's largest connected commercial cluster, not tile count, and with no minimum height requirement — the largest cluster wins outright, same as Land Lord.
- **Live VP display**: since agendas are public/open rather than secretly dealt, the "VP so far" stat includes any agenda bonuses currently met — there's no longer hidden information to protect.
- **3-4 player generalization**: the source rules are written for exactly 2 players. Turn order, agenda dealing, price-tier sizing, and the "everyone passes" end condition all generalize by treating "the opponent" as "every other active player."
- **Auction tile assignment**: any eligible player can win a 3rd-floor auction, not just whoever initiated it — the winner places on one of their own eligible tiles, which may be a different tile (or player) than what started the auction.
- **Auction bidder eligibility**: only players who already have an eligible tile of the matching type *and* can afford the $3M floor may bid — nobody can win an auction they can't actually use.
- **Pool scaling on larger boards**: floor pool sizes (tuned for the original 5x5's 24 buildable squares) scale proportionally to buildable-square count on 7x7/11x11 boards, rounded to the nearest whole tile.
- **Park tile**: the brief specified no rent and a flat 5 VP at game end; cost, capacity rules, and stacking were unspecified judgment calls. Set at a $1M base price above Commercial ($3M vs $2M) since it pays a large lump sum instead of ongoing income — this is a balance guess, not a tuned number. Parks require spare residential capacity to build, same as Commercial (a park still needs a resident living nearby), are subject to the same escalating price tier as the other two types, and never stack (always single-story) — so they also count toward the Low Rise agenda like any other unstacked tile. The AI's build-scoring heuristic was given a small VP-weighted term so it has a reason to occasionally choose Park over pure-income builds, though it still leans toward Commercial/Residential most of the time since those score on ongoing income too.
- **Urban Jungle**: added as a fifth agenda, following the exact same "biggest connected cluster, no minimum, highest wins outright" pattern already established for Land Lord and Central Business District — scored by park tile count in a player's largest connected park cluster (equivalent to unit count, since parks never stack).
- **Adjacency rent modifiers — ownership and stacking**: the modifier looks at any adjacent park/commercial tile regardless of owner (proximity to a park or a factory affects property value whether or not you built it). Multiple qualifying neighbors stack multiplicatively (confirmed via playtesting: two adjacent parks give 4x rent) rather than capping at one application, and a park + commercial neighbor pair cancels out to 1x rather than either one taking priority — both were explicit design calls rather than the more conservative "cap at one application" default. Rounding is per-tile (compute the tile's full stories-based income, apply the multiplier, then floor), not per-story or per-neighbor.
