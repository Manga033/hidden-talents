# Hidden Talent — fair, evidence-backed scouting

Web app for scouting U21 professionals fairly: every player gets a traditional rank (goals, assists, market value) and a fair rank (on-pitch impact with team strength taken into account), and every difference is explained with the numbers behind it.

```
server/             Node server: sign-in, roles, data API, serves the app
  data/             engine output (data.json, hidden_talent_2025_26.csv) + nationality_2025_26.csv — never served directly
  demo-users.json   demo accounts (plain-text, not in git) — copy demo-users.example.json and set passwords; users.json (hashed) is created from it on first start
src/auth/roles.js   who can see what (used by the server and the app)
src/engine/         JavaScript port of the scoring layer of the Python engine
src/pages/          Discover, Players, Find your star, Compare, Hidden talents, Fairness check, Favourites
engine-python/      the Python engine (step1 … step6) that produces the data files
```

## Run

```
npm install
npm run dev        # http://localhost:5191 (sign-in, API and hot reload)
npm run build && npm start   # production: serves dist/ on PORT (default 5191)
```

First start: copy `server/demo-users.example.json` to `server/demo-users.json` and choose passwords, or create accounts directly:

```
npm run users -- add <username> <director|scout|coach> <password> [full name]
npm run users -- remove <username>
npm run users -- list
```

Set `SESSION_SECRET` in production (otherwise a random secret is stored in `server/.session-secret`). Serve behind HTTPS.

## Roles

| | Sporting director | Scout | Coach |
|---|---|---|---|
| Discover (Hidden XI), Players, profiles, Compare, Favourites | ✓ | ✓ | ✓ |
| Find your star (game-model weights) | ✓ | ✓ | |
| Hidden talents | ✓ | ✓ | |
| Market values | ✓ | ✓ | |
| Contracts to review | ✓ | | |
| Fairness check | ✓ | | |
| Upload new engine output | ✓ | | |

The server removes the data a role may not see before sending it, so hidden fields never reach the browser.

## New season

Run the Python engine on the new Transfermarkt export, then sign in as sporting director and use *Update player data* (user menu). Previous files are kept in `server/data/backups/`. Nationality comes from Transfermarkt's `players.csv` (`country_of_citizenship`); `step6_export.py` now writes it into data.json as `country`.

## Engine changes in this version (JS and Python kept in sync)

- **Similar players:** 100 − average percentile gap over the four scored metrics (cosine similarity ignored magnitude, so a star and a fringe player with the same profile shape scored 100%).
- **Confidence:** absolute bands by how much of the pool the likely rank range covers (High < ⅓, Medium < ⅔, Low otherwise) instead of thirds of the pool.
- **Scout live:** top-15% upside *and* low confidence (data cannot place him yet).
- **Strengths:** fair z (already shrunk) is no longer shrunk a second time.

`npm run verify` re-runs the JavaScript engine against the export in `server/data/`.
