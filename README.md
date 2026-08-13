# City Developers — Digital Prototype

A playtesting web app for **City Developers**, a 2-player area-control board game on a 5x5 grid. Built for quickly testing rules changes — prioritizes a correct, playable ruleset over visual polish. No backend: all state is in-memory for the duration of a single session.

## Modes

- **Two Computers** — pass-and-play hot-seat. Two humans share one screen and alternate turns.
- **Player vs Computer** — play against a simple heuristic AI. The AI always makes a legal move; it isn't tuned to play well, just to play validly and lean toward its own (hidden) secret agenda.

## Running locally

```bash
npm install
npm run dev
```

Then open the printed local URL. `npm run build` produces a static production build in `dist/`; `npm run lint` runs Oxlint.

## Rules implemented

- 5x5 board, permanent neutral Town Hall at center.
- Setup: each player places 2 free residential tiles (each player's first tile adjacent to Town Hall, then each player's second tile adjacent to Town Hall or their own first tile), then is dealt one hidden secret agenda.
- Every build must be orthogonally adjacent to Town Hall or a tile that player already owns — you can only grow your own footprint, not build off an opponent's tiles.
- One action per turn: build (Residential $1M / Commercial $2M), stack a floor on your own tile (2nd floor $2M, 3rd floor $3M, drawn from a shared, type-specific pool: 8/8 for 2nd floor, 4/4 for 3rd floor), or pass.
- Residential capacity: every tile you own needs a resident behind it. Your total residential units (stories) must be at least your total tile count (residential + commercial squares owned). Residential builds are self-covering (they add one unit and one tile at once), so this only ever gates commercial — you need spare residential capacity, typically from stacking, before building a new commercial tile.
- Income collected at the end of every turn: $1M per residential unit + $2M per commercial unit owned.
- Game ends when the board is completely full, or both players pass in a row.
- Scoring: 1 VP/residential unit, 2 VP/commercial unit, plus a secret agenda bonus (Land Lord, Central Business District, Low Rise, Suburbs — see in-app "Quick rules reference"). Land Lord and Central Business District are comparative — only the player ahead gets the bonus, and a tie gives it to neither. Low Rise and Suburbs are flat thresholds either or both players can independently satisfy. Ties on final VP break on cash on hand, then share the win.

Secret agendas stay hidden during play — in hot-seat mode via a self-serve "Peek my agenda" toggle you dismiss before passing the device, in PvC mode the AI's agenda is simply never shown — and are revealed on the results screen at game end.

## Assumptions flagged during implementation

The source rules text had a couple of points that admit more than one reading; these were resolved as follows (revisit if they don't match design intent):

- **Central Business District — group ownership**: a connected commercial group is computed only through tiles you own; an opponent's tile (or an empty square) breaks the chain into separate groups.
- **Central Business District — "largest"**: read as comparative, mirroring Land Lord — the agenda triggers only if your largest owned commercial group is strictly bigger than your opponent's largest owned commercial group *and* yours includes at least two tiles at 2+ stories. A tie on group size does not trigger the bonus for either player (the source text doesn't state a tiebreak here; this mirrors Land Lord's explicit tie rule for consistency).
- **Live VP display**: the optional "VP so far" stat shown during play deliberately excludes the secret agenda bonus, so it can't be used to infer whether an opponent's hidden agenda is currently satisfied.
