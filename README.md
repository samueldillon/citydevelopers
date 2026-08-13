# City Developers — Digital Prototype

A playtesting web app for **City Developers**, an area-control board game on a 5x5 grid, for 2-4 players. Built for quickly testing rules changes — prioritizes a correct, playable ruleset over visual polish. No backend: all state is in-memory for the duration of a single session.

## Setup flow

Choose a player count (2-4), then toggle each seat between Human and Computer independently — any mix works, including hot-seat-only, all-computer (spectator), or a human against several AI opponents. Turn order is randomized at the start of every game. The AI always makes a legal move; it isn't tuned to play well, just to play validly and lean toward its own (hidden) secret agenda.

## Running locally

```bash
npm install
npm run dev
```

Then open the printed local URL. `npm run build` produces a static production build in `dist/`; `npm run lint` runs Oxlint.

## Rules implemented

- 5x5 board, permanent neutral Town Hall at center (exactly 4 orthogonal neighbors — one per player at 4-player games).
- Setup: every player places 2 free residential tiles, two rounds through turn order — round 1 each player's tile must be adjacent to Town Hall, round 2 each player's tile must be adjacent to Town Hall or their own first tile. Each player is then dealt one hidden secret agenda (agendas are unique per game — with 4 players, all four get used).
- Every build must be orthogonally adjacent to Town Hall or a tile that player already owns — you can only grow your own footprint, not build off another player's tiles.
- One action per turn: build (Residential $1M / Commercial $2M base price), stack a floor on your own tile (2nd floor $2M, 3rd floor $3M, drawn from a shared, type-specific pool: 8/8 for 2nd floor, 4/4 for 3rd floor), or pass.
- Build prices escalate: every N new builds (N = active player count, either type, any player, combined) adds $1M to both types' price, uncapped for the rest of the game. Tying the tier size to the player count means each price bracket gives every player an equal shot at it regardless of turn order. Stacking costs are unaffected — this only paces new-tile expansion, as a brake on the income snowball.
- Residential capacity: every tile you own needs a resident behind it. Your total residential units (stories) must be at least your total tile count (residential + commercial squares owned). Residential builds are self-covering (they add one unit and one tile at once), so this only ever gates commercial — you need spare residential capacity, typically from stacking, before building a new commercial tile.
- Income collected at the end of your own turn only (build, stack, or pass all count): $1M per residential unit + $2M per commercial unit you own. Other players don't collect on your turn.
- Game ends when the board is completely full, or every player passes in a row (a full round with nobody acting).
- Scoring: 1 VP/residential unit, 2 VP/commercial unit, plus a secret agenda bonus (Land Lord, Central Business District, Low Rise, Suburbs — see in-app "Quick rules reference"). Land Lord and Central Business District are single-winner agendas — you must be strictly ahead of every other player, and a tie for the lead (between any players, not just two) gives the bonus to nobody. Low Rise and Suburbs are flat thresholds any number of players can independently satisfy. Ties on final VP break on cash on hand; if still tied, those players share the win.

Secret agendas stay hidden during play behind a self-serve "Peek my agenda" toggle on every human seat (the screen may be shared by more than one human), and are revealed on the results screen at game end. AI agendas are never shown until then either.

## Assumptions flagged during implementation

The source rules text had a couple of points that admit more than one reading; these were resolved as follows (revisit if they don't match design intent):

- **Central Business District — group ownership**: a connected commercial group is computed only through tiles you own; another player's tile (or an empty square) breaks the chain into separate groups.
- **Central Business District — "largest"**: read as comparative, mirroring Land Lord — the agenda triggers only if your largest owned commercial group is strictly bigger than every other player's largest owned commercial group *and* yours includes at least two tiles at 2+ stories. A tie for the lead does not trigger the bonus for anyone (the source text doesn't state a tiebreak here; this mirrors Land Lord's explicit tie rule for consistency).
- **Live VP display**: the optional "VP so far" stat shown during play deliberately excludes the secret agenda bonus, so it can't be used to infer whether another player's hidden agenda is currently satisfied.
- **3-4 player generalization**: the source rules are written for exactly 2 players. Turn order, agenda dealing, price-tier sizing, and the "everyone passes" end condition all generalize by treating "the opponent" as "every other active player." Worth a dedicated playtest — a 5x5 board (24 buildable squares) fills up fast with 4 players going.
