# Scoutee

Scoutee is a football recruitment decision-support project for comparing under-21 professional players with a traditional reputation-based ranking and a context-aware individual-performance ranking.

The current release uses the **v3 individual-role model** and a canonical, deterministic development dataset. Position rank is authoritative: goalkeepers, defenders, midfielders and forwards are ranked only against their own position group. The cross-position overall rank is experimental and is not the main recruitment result.

> **Important:** the current event, physical, availability, contract and match-context data is generated synthetic development data. Scores and ranks are not real scouting conclusions and must not be used as facts about real players. Replace synthetic fields with licensed or verified data and validate the model on unseen seasons before real recruitment use.

## Current model status

- Model: `3.0.0-individual-role-model`
- Dataset: `3.0.0-synthetic-foundation`
- Players: 489
- Position groups: 168 forwards, 147 midfielders, 158 defenders and 16 goalkeepers
- Confidence: 49 High, 294 Medium and 146 Low
- Flags: 18 Hidden Talent, 21 Priced Above Output and 13 Watch Live
- Uncertainty: 300 correlated Monte Carlo simulations
- Single ranking source: `server/data/model-v3/engine_v3.json`
- Canonical rank contract: `server/data/model-v3/canonical_rankings.json`

The ability score never uses market value. Market value appears only in the deliberately simple traditional comparison ranking and recruitment context.

## Architecture

Scoutee now has one active ranking engine. The engine runs as a deterministic build step and writes versioned output; the server loads that result and the application displays it without recalculating ranks.

```text
canonical CSV files
        │
        ▼
scripts/build-engine-v3.mjs
        │
        ├── engine_v3.json              full authoritative result
        ├── canonical_rankings.json     compact cross-page rank contract
        ├── engine_v3_players.csv       flat review export
        └── model_report.json           validation summary
        │
        ▼
server/index.mjs ──► authenticated API ──► application
```

The former `src/engine/` browser engine and its old `data.json`/CSV exports were removed. Every page receives the same player objects from the shared store, so a player's fair rank, traditional rank, score, confidence and flags have one source.

The Python pipeline in `engine-python/` remains as historical data-preparation work. Its minutes-alignment and event-coverage handling were corrected, but it is not the active v3 scoring engine.

## Technology

| Part | Technology |
|---|---|
| Application | React 19, Vite 7, plain CSS and SVG charts |
| Server | Node.js built-ins (`http`, `crypto`, `fs`) |
| Active model and data tooling | JavaScript ES modules run by Node.js |
| Authentication | scrypt password hashes and HMAC-SHA256 signed cookies |
| Historical pipeline | Python, pandas, NumPy, SciPy and scikit-learn |

No database is required for the current development build.

## Getting started

### Requirements

- Node.js 20 or newer
- npm

### Install and run

```bash
npm install
npm run dev
```

Open <http://localhost:5191>.

For a production build:

```bash
npm run build
npm start
```

`PORT` defaults to `5191`. `SESSION_SECRET` may be supplied in production; otherwise a random key is stored in `server/.session-secret`.

### Accounts

On first start, `server/users.json` is created from `server/demo-users.json`. Stored user records contain password hashes rather than plaintext passwords. Manage accounts with:

```bash
npm run users -- list
npm run users -- add <username> <director|scout|coach> <password> [full name]
npm run users -- remove <username>
```

Replace the development accounts before deploying the project.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Run the API and Vite development server |
| `npm run build` | Create the production application build |
| `npm start` | Serve `dist/` and the API |
| `npm run data:generate` | Regenerate the deterministic canonical development dataset |
| `npm run data:validate` | Validate schemas, row relationships, minutes and match reconciliation |
| `npm run engine:v3` | Rebuild all v3 scores, ranks, flags and explanations |
| `npm run engine:v3:validate` | Compare JSON, CSV and canonical model outputs and validate rank sequences |
| `npm run ranks:validate` | Verify the canonical rank, score, confidence and flag contract used by the application |
| `npm run verify` | Run dataset validation, model validation, rank consistency and the production build |
| `npm run users -- …` | Manage local accounts |

The normal full rebuild sequence is:

```bash
npm run data:generate
npm run data:validate
npm run engine:v3
npm run engine:v3:validate
npm run ranks:validate
npm run build
```

Generated canonical CSV files should not be edited by hand.

## Project structure

```text
├── engine-python/                  historical Python preparation pipeline
├── scripts/
│   ├── dataset-schema.mjs          canonical column definitions
│   ├── generate-canonical-dataset.mjs
│   ├── generate-engine-ready-dataset.mjs
│   ├── validate-canonical-dataset.mjs
│   ├── build-engine-v3.mjs         active scoring engine
│   ├── validate-engine-v3.mjs
│   └── validate-ui-ranks.mjs
├── server/
│   ├── index.mjs                   authentication, role-filtered data API, static files
│   ├── auth.mjs                    password and session security
│   ├── users.mjs                   account management command
│   └── data/
│       ├── canonical/              normalized input dataset and schema
│       └── model-v3/               authoritative v3 model outputs
├── src/
│   ├── auth/roles.js               page and field permissions
│   ├── model/v3.js                 display labels and v3 explanation helpers
│   ├── store.jsx                   shared session, canonical players and saved state
│   ├── pages/
│   ├── components/
│   ├── lib/
│   └── styles/
└── public/assets/
```

## Canonical dataset

The canonical foundation is stored in `server/data/canonical/`. It is deterministic, generated with seed `20261114`, and validated as a connected set rather than as independent CSV files.

| File | Rows | Purpose |
|---|---:|---|
| `players.csv` | 489 | identity, physical profile and primary role |
| `teams.csv` | 200 | club and competition context |
| `matches.csv` | 5,000 | match results and expected-goals context |
| `player_matches.csv` | 11,499 | player-match attacking, passing and defensive events |
| `player_season_stats.csv` | 489 | reconciled season totals |
| `goalkeeper_stats.csv` | 16 | goalkeeper-specific evidence |
| `availability.csv` | 233 | generated injuries, illness and suspensions |
| `contracts.csv` | 489 | generated recruitment and contract context |
| `data_quality.csv` | 2,950 | provenance, completeness and coverage records |
| `context_players.csv` | 4,800 | generated squad context players |
| `match_lineups.csv` | 180,000 | complete match team sheets |
| `shot_events.csv` | 155,286 | shot location, situation, outcome, xG and post-shot xG |
| `team_match_stats.csv` | 10,000 | possession and team-match performance |
| `position_minutes.csv` | 957 | minutes and shares by actual role |
| `physical_stats.csv` | 489 | generated speed and workload indicators |

The validator checks, among other constraints:

- unique and valid player, team and match identifiers;
- season minutes aligned with player-match and position-minute totals;
- exactly 11 starters per team in complete lineups;
- match goals reconciled with goal shot events;
- match xG reconciled with shot-event xG;
- valid event coverage rather than interpreting missing event minutes as zero performance;
- goalkeeper-only fields and minimum data-quality requirements.

Player identity, age, club, position, minutes, goals, assists, Elo and market value originated from the earlier Scoutee output. Added event, lineup, physical, availability and recruitment detail is deterministic synthetic development data and is explicitly labelled as such.

## How engine v3 works

### 1. Individual features

Outfield players are evaluated from individual evidence in nine categories:

- scoring;
- chance creation;
- progression;
- retention;
- possession-adjusted defending;
- pressing and discipline;
- aerial play;
- physical output;
- availability.

Goalkeepers use a separate model: shot stopping, distribution, command of crosses, sweeping, physical output and availability.

The shot dataset contains shot-level xG and post-shot xG. Defensive, pressing and aerial event rates are adjusted for out-of-possession opportunity, reducing the penalty applied to players on high-possession teams.

### 2. Position standardization and outliers

Each component is standardized inside its broad position group. Values are winsorized at the 2nd and 98th percentiles before standardization, and component z-scores are capped to `[-3, 3]` so one extreme record cannot define the entire scale.

### 3. Reliability and small-sample shrinkage

Each category receives a category-specific minute threshold `k` and an event-coverage adjustment:

```text
reliability = minutes / (minutes + k) × event coverage
adjusted category z = raw category z × reliability
```

Thresholds range from 300 minutes for availability to 1,500 for goalkeeper shot stopping. Low-minute or incomplete samples therefore move toward the position mean rather than being treated as equally reliable.

### 4. Tactical-role weights

The model has fixed weights for GK, CB, full-back, defensive midfield, central midfield, attacking midfield, winger and striker roles. For example, striker scoring receives more weight, while centre-back defending and aerial play receive more weight.

These are fixed model definitions. The application does not create different official rankings on different pages.

### 5. Covariance-aware performance score

Categories overlap: progression and creation, for example, are not independent. V3 estimates the category covariance matrix within each position group and scales the weighted composite by its covariance-aware standard deviation:

```text
raw composite = Σ(weight × adjusted category z)
performance z = raw composite / √(wᵀΣw)
```

This prevents correlated categories from being counted as if each supplied completely separate evidence.

### 6. Conservative team-context correction

V3 estimates the remaining linear relationship between performance and team Elo inside each position group. It removes only 35% of that association and caps the adjustment at 0.35 standard deviations:

```text
fair z = performance z − capped context correction
fair score = clamp(round(50 + 12 × fair z), 1, 99)
```

This is a conservative statistical correction, not a causal estimate. Team strength can reflect both environment and genuine player quality.

### 7. Authoritative position ranking

Players are ordered by fair z inside GK, DEF, MID and FWD pools. This `positionRank` is authoritative. The engine also produces an experimental overall rank, but comparisons across fundamentally different positions have different evidence quality and should be treated cautiously.

### 8. Traditional comparison ranking

The traditional baseline is calculated inside the same position group:

```text
traditional z = 0.5 × z(goals + assists) + 0.5 × z(log market value)
traditional score = clamp(round(50 + 12 × traditional z), 1, 99)
```

It is a deliberately simple reputation-and-visible-output comparison axis. It is not intended to represent the full work of a professional scout, and it never enters the v3 ability score.

### 9. Uncertainty

The engine runs 300 seeded, correlated Monte Carlo simulations per position group. Category covariance supplies the correlation structure, while each player's category reliability controls remaining noise. The 10th and 90th percentiles produce score and position-rank intervals.

Confidence requires both sufficient coverage and a sufficiently narrow rank interval:

- **High:** at least 900 minutes, at least 90% coverage and interval width no greater than 28% of the position pool;
- **Medium:** at least 600 minutes, at least 75% coverage and interval width no greater than 58%;
- **Low:** everything else.

### 10. Flags

| Flag | Rule |
|---|---|
| Hidden Talent | Fair position rank is in the top 15%, and the traditional position rank is worse than the player's simulated fair-rank interval |
| Priced Above Output | Traditional position rank is in the top 15%, the fair-rank drop is at least 15% of the position pool, the traditional rank is outside the fair interval, and confidence is not Low |
| Watch Live | Fair position rank is in the top 25% with fewer than 900 minutes |
| Transfer opportunity | Contract ends in the review window and the player is in the fair top 25% of his position group |

Flags are prompts for further scouting, not transfer recommendations or forecasts of career potential.

### 11. Exact explanations and role fit

Every displayed score is decomposed into a baseline of 50, category contributions and context points. Those components add back to the unrounded total and validated rounded score. Strengths and weaknesses come from category scores, and alternative compatible tactical-role weights produce role-fit scores.

## Model output

`server/data/model-v3/` contains:

| File | Purpose |
|---|---|
| `engine_v3.json` | complete API model including categories, explanations, uncertainty and flags |
| `canonical_rankings.json` | compact immutable ranking contract for consistent use throughout the application |
| `engine_v3_players.csv` | flat export for inspection and analysis |
| `model_report.json` | validation result, group counts and confidence summary |

The server joins the model result with canonical player, season and contract records. Role restrictions are applied before the response leaves the server.

## Security

- Every data endpoint requires authentication.
- Role permissions are enforced on the server; restricted market and contract fields are removed before transmission.
- Passwords use scrypt with per-user salts.
- Sessions use signed, eight-hour, HttpOnly, SameSite=Strict cookies.
- Login is rate-limited to eight failed attempts per IP per ten minutes.
- Static serving includes path-traversal protection, Content Security Policy, `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`.
- `server/users.json`, `server/demo-users.json` and `server/.session-secret` are excluded from git.

## Limitations and work required before real use

- Most detailed inputs are synthetic and must be replaced with licensed, verified data.
- There are only 16 goalkeepers, so goalkeeper estimates remain especially sample-sensitive.
- The context correction is observational and cannot cleanly separate club environment from player quality.
- The current model is not a causal model of individual contribution.
- Tracking-derived off-ball positioning, tactical assignments, dominant pressure, medical assessment, character, adaptability and verified scouting reports are not fully represented.
- Contract, wage, agent and availability information must be verified before recruitment decisions.
- The model has not yet been back-tested on unseen real seasons for transfer success, future minutes or performance persistence.
- Confidence describes uncertainty in this model and dataset; it does not measure certainty about a player's future.
- Fair rank means a more context-aware estimate of current modeled output, not objective truth, morality or guaranteed potential.

Scoutee should support video review, live scouting, medical review and human decision-making—not replace them.

## Licences and credits

- Original identity and baseline fields were derived from the earlier Scoutee/Transfermarkt-based development output.
- Transfermarkt open datasets by David Cariboo: [transfermarkt-datasets](https://github.com/dcaribou/transfermarkt-datasets), CC0.
- Manrope and Barlow Condensed: SIL Open Font License.
- [flag-icons](https://github.com/lipis/flag-icons): MIT License.
- UI concept: the original wine-and-gold scouting template used by the project.
- Development included AI-assisted implementation and review.
