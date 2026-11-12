# Scoutee

**Fair, evidence-backed scouting of U21 professional footballers.**

Scoutee ranks 489 under-21 professionals from the 2025/26 season in two ways side by side:

- a **traditional rank** — goals, assists and market value, the way a standard scouting list looks;
- a **fair rank** — what the player actually does on the pitch, measured per 90 minutes, pulled towards the average when the sample is small, and corrected for the strength of his club.

The gap between the two is where hidden talents are. Every rank in the app comes with its reasons, so the answer to *"why is this player ranked above that one?"* is always a set of numbers, not an opinion.

---

## Contents

1. [The problem](#the-problem)
2. [What the app does](#what-the-app-does)
3. [Roles and access](#roles-and-access)
4. [Tech stack and development environment](#tech-stack-and-development-environment)
5. [Getting started](#getting-started)
6. [Project structure](#project-structure)
7. [Data](#data)
8. [How the engine works](#how-the-engine-works)
9. [Updating the data for a new season](#updating-the-data-for-a-new-season)
10. [Security](#security)
11. [Limitations](#limitations)
12. [Engine change log](#engine-change-log)
13. [Licences and credits](#licences-and-credits)

---

## The problem

Youth and young-professional scouting is biased in three well-documented ways:

| Bias | What happens | What the data in this project shows |
|---|---|---|
| **Relative age effect** | Players born early in the selection year are older and more developed than their peers, so they are picked more often. | The pool has **2.7× more players born January–March (190) than October–December (71)**; χ² test against an even spread, p < 0.001. |
| **Club strength** | A player at a strong club produces better numbers partly because his team-mates are better. | The traditional ranking follows club strength closely (rank correlation **0.66** with club Elo). |
| **Reputation and price** | Lists favour players who are already expensive. | The traditional ranking correlates **0.90** with market value. |

Scoutee measures players on what they do while they are on the pitch, corrects for club strength, and shows how certain each ranking is.

**What "fair" means here.** Fair to players at smaller clubs and in smaller leagues: the traditional list follows club strength (0.66), the fair ranking does not (0.00). Birth-date bias is real but happens *before* the professional level — 2.7× more January–March births reach the pool — and inside the pool neither ranking adds a significant lean (Fisher p = 0.75 in the top 20). Scoutee audits birth dates; it does not claim to correct them, because the age effect inside the pool is not significant.

---

## What the app does

| Page | Purpose |
|---|---|
| **Discover** | *The Hidden XI*: the best eleven on a half-pitch, switchable between the fair and the traditional pick and between 4-3-3, 4-2-3-1 and 3-5-2. Lists every player who comes in or goes out, with the reasons. |
| **Players** | The whole pool as cards, grouped by position, with search, birth-quarter and flag filters. |
| **Player profile** | Fair and traditional rank — the headline number is the rank **within the position** (e.g. *#3 of 147 midfielders*), the overall rank is secondary, a one-line verdict with its reasons, key metrics as position percentiles with plain-language facts, a radar against the position average, the likely rank range, the season's numbers, similar players and private scout notes. |
| **Find your star** | Choose a game model (Balanced, Attacking, Defensive or custom weights). Every fair rank, flag and confidence range is recomputed live. Filters and a paginated, sortable table. |
| **Compare** | Up to four players. *"Why A ranks above B"* splits the gap into points per metric, separates on-pitch performance from the club-strength correction, and says when the two are statistically level. |
| **Hidden talents** | Raw-versus-fair scatter plot, the biggest risers with reasons, players *priced above output* (high on the traditional list, low on the fair one beyond their rank range) and players worth watching live. |
| **Fairness check** | Birth-date bias in the pool, the effect of the club-strength correction, transfer opportunities (expiring contracts of players the fair ranking rates highly). |
| **Favourites** | A personal scouting board. |

Design: wine and gold palette, Manrope and Barlow Condensed, white half-pitch — based on the *abbbbb* UI template. The app shows no photographs of players (many are minors); a neutral silhouette is used instead.

---

## Roles and access

Sign-in is required. The server removes the data a role may not see **before** sending it, so hidden fields never reach the browser.

| | Sporting director | Scout | Coach |
|---|:---:|:---:|:---:|
| Discover, Players, profiles, Compare, Favourites | ✓ | ✓ | ✓ |
| Find your star (game-model weights) | ✓ | ✓ | |
| Hidden talents | ✓ | ✓ | |
| Market values | ✓ | ✓ | |
| Contracts to review, Fairness check | ✓ | | |
| Upload new engine output | ✓ | | |

The rules live in one file, [`src/auth/roles.js`](src/auth/roles.js), used by both the server and the app.

---

## Tech stack and development environment

**Application**

| Part | Technology |
|---|---|
| Front end | React 19 (19.3.1), Vite 7 (7.3.8), plain CSS, hand-drawn SVG charts (no chart library) |
| Server | Node.js built-ins only (`http`, `crypto`, `fs`) — no framework, no database |
| Authentication | scrypt password hashes, HMAC-SHA256 signed session cookies (HttpOnly, SameSite=Strict) |
| Flags | [`flag-icons`](https://github.com/lipis/flag-icons) 7.2.3 |
| In-browser engine | JavaScript port of the scoring layer (`src/engine/`) |

**Data engine**

| Part | Technology |
|---|---|
| Language | Python 3 |
| Libraries | pandas, NumPy, SciPy, scikit-learn (gradient-boosted quantile regression) |

**Development environment**

- Windows 10 Home (build 19045)
- Node.js 24.22.1, npm 11.14.1
- Developed with AI assistance (Claude Code, Anthropic) on top of the team's Python engine and the *abbbbb* UI template.
- The Python pipeline reads the Transfermarkt CSVs from `HT_INPUT` and writes intermediate files to `HT_OUT` (environment variables; defaults `/mnt/user-data/uploads/` and `/home/claude/out/`). Install its packages with `pip install -r engine-python/requirements.txt`.

---

## Getting started

### Requirements

- Node.js 20 or newer (developed on 24) and npm
- For re-running the data engine: Python 3 with pandas, numpy, scipy and scikit-learn, and the Transfermarkt export (see [Data](#data))

### Install and run

```bash
npm install
npm run dev
```

Open <http://localhost:5191>. This starts one Node process that serves the sign-in API, the data API and the app with hot reload.

### Accounts

On first start the server creates `server/users.json` (hashed passwords only) from `server/demo-users.json`. That file is not in git; create it from the example:

```bash
cp server/demo-users.example.json server/demo-users.json
```

Edit the passwords, then start the server. To manage accounts directly:

```bash
npm run users -- add <username> <director|scout|coach> <password> [full name]
npm run users -- remove <username>
npm run users -- list
```

### Production

```bash
npm run build
npm start
```

`npm start` serves the built app from `dist/` together with the API. Set these environment variables:

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Port to listen on | `5191` |
| `SESSION_SECRET` | Key that signs session cookies | random key stored in `server/.session-secret` |

Serve it behind HTTPS (the server marks cookies `Secure` when the proxy sends `X-Forwarded-Proto: https`).

### Other scripts

| Command | What it does |
|---|---|
| `npm run verify` | Re-runs the JavaScript engine on `server/data/` and compares it with the exported files |
| `npm run export` | Writes the current engine's ranks, scores, flags and rank ranges into `server/data/` |
| `npm run users -- …` | Account management (above) |

---

## Project structure

```
├── engine-python/          Python data engine (step1 … step6 + engine.py)
├── server/
│   ├── index.mjs           HTTP server: sign-in, data API, uploads, static files
│   ├── auth.mjs            password hashing and signed session cookies
│   ├── users.mjs           account command-line tool
│   ├── data/               engine output — never served directly
│   │   ├── data.json
│   │   ├── hidden_talent_2025_26.csv
│   │   └── nationality_2025_26.csv
│   └── demo-users.example.json
├── src/
│   ├── auth/roles.js       who can see what
│   ├── engine/             JavaScript scoring engine
│   │   ├── constants.js    every constant, copied from the Python engine
│   │   ├── stats.js        OLS, t and χ² distributions, Fisher's exact test, seeded RNG
│   │   ├── engine.js       correction, composite, ranks, flags, Monte Carlo, robustness
│   │   ├── explain.js      plain-language facts and score breakdowns
│   │   ├── pool.js         loads and joins data.json + CSVs
│   │   └── verify.js       bias audit and reproducibility check
│   ├── pages/              one file per screen
│   ├── components/         shared UI and charts
│   ├── lib/                Best XI formations, country flags
│   ├── styles/             template styles + app styles
│   └── store.jsx           app state: session, data, engine runs, favourites
├── public/assets/          fonts, favicon, pitch drawing
└── scripts/verify-engine.mjs
```

---

## Data

**Source:** [Transfermarkt open data](https://github.com/dcaribou/transfermarkt-datasets) (CC0), data up to July 2026. The Python engine reads `games.csv`, `appearances.csv`, `game_lineups.csv`, `game_events.csv`, `players.csv`, `player_valuations.csv` and `clubs.csv`.

**The pool:** players under 21 on 1 January 2026 with at least 450 minutes in the 2025/26 season — **489 players** (168 forwards, 147 midfielders, 158 defenders, 16 goalkeepers) from about 14 domestic leagues plus the European cups.

**Files the app uses** (in `server/data/`):

| File | Made by | Contents |
|---|---|---|
| `data.json` | `step6_export.py` | Players with raw and fair z-scores per metric, potential, flags, bias audit |
| `hidden_talent_2025_26.csv` | `step6_export.py` | Exact age, club Elo, minutes, goals, assists, market value, rank ranges |
| `nationality_2025_26.csv` | joined from `players.csv` | Citizenship per player, for the flags |

The Python export writes missing values as `NaN`, which is not valid JSON; the loader reads them as missing.

---

## How the engine works

The engine has two parts. The **Python pipeline** turns the full Transfermarkt export (about 1.5 GB) into per-player metrics. The **JavaScript engine** in the app repeats the scoring layer on those metrics, so weights can change live and every score can be explained.

```
Transfermarkt CSVs
   │  step1  team Elo ratings
   │  step2  goals while each player is on the pitch
   │  step3  player-season totals
   │  step4b shrinkage constants (from 2015–2025)
   │  step5  back-test on earlier seasons
   │  step6  scores, flags, confidence → data.json + CSV
   ▼
server/data  ──►  JavaScript engine  ──►  app
```

### 1. Club strength — Elo ratings (`step1_elo.py`)

Every club gets an Elo rating from every match in the data, in the style of the World Football Elo ratings and ClubElo:

- expected result: `E = 1 / (1 + 10^(−Δ/400))`, where `Δ` = rating difference + 65 home advantage (0 at neutral venues);
- update: `R' = R + K · G · (S − E)` with `K = 20`, `S` = 1 / ½ / 0, and goal-margin factor `G` = 1, 1.5, or `(11 + n)/8` for a margin of `n ≥ 3`;
- each summer every rating moves 15% towards its league's mean; clubs start at their league's average (the pipeline runs twice to set this).

A linear regression of goal difference on rating difference gives the **expected goal difference** of every match.

### 2. On-pitch impact (`step2_playergames.py`)

From line-ups, substitutions and goal events, the engine finds the goals scored and conceded **while each player was on the pitch**, and subtracts what Elo expected for those minutes:

- `res_off` = goals for − expected goals for (positive = his team attacked better than expected)
- `res_def` = −(goals against − expected goals against) (positive = his team defended better than expected)

This is the "plus-minus" family of metrics used in football and basketball analytics.

### 3. Metrics per 90 minutes

| Metric | Definition |
|---|---|
| Goals + assists per 90 | His own goal involvements |
| Team attacking impact per 90 | `res_off` per 90 |
| Team defensive impact per 90 | `res_def` per 90 |
| Impact vs stronger opponents | On-pitch impact only against equal or stronger teams — **context only, weight 0** (estimated true-talent variance is zero) |
| Discipline | yellow + 2 × red cards per 90, sign flipped so fewer cards score higher |

### 4. Shrinkage — trusting small samples less (`step4b_shrink.py`)

A defender with 5 goal involvements in 600 minutes is probably not as good as 0.75 per 90 suggests. The engine uses **empirical Bayes shrinkage**:

```
estimate = (player total + k · position average) / (player 90s + k)
```

`k` is how many full matches of evidence weigh as much as the position average. It is estimated from all 2015–2025 player-seasons with a method-of-moments variance split: observed variance = true-talent variance (τ²) + noise / 90s, and `k = noise / τ²`.

| k (90-minute matches) | Forwards | Midfielders | Defenders | Goalkeepers |
|---|---:|---:|---:|---:|
| Goals + assists | 10.8 | 5.1 | 12.4 | 36.3 |
| Attacking impact | 110.4 | 57.2 | 65.6 | 542.7 |
| Defensive impact | 798.8 | 202.3 | 353.2 | 130.7 |
| Discipline | 300.0 | 64.6 | 129.3 | 53.9 |

Large values mean the metric is mostly noise for that position: at the median 1,118 minutes, goals + assists is 50–71% signal for outfield players (25% for goalkeepers), team defensive impact only 2–9%.

### 5. z-scores in true-talent units

`z = (estimate − position mean) / √τ²`

Each z-score is measured in **true-talent standard deviations**, so a noisy metric is not inflated back to full size.

### 6. Club-strength correction (`engine.adjust`)

Each z-score is regressed (ordinary least squares, all positions pooled) on decimal age and club Elo per 100 points. A term is removed **only if it is significant (p < 0.05)**:

```
fair z = z − b_age · (age − mean age) − b_Elo · (Elo − mean Elo) / 100
```

In the 2025/26 pool: goals + assists, attacking and defensive impact depend significantly on club strength and are corrected (all p < 0.001); discipline and age show no significant effect and are left alone. After correction the fair ranking's link to club strength is 0.00 (traditional: 0.66).

### 7. Fair score

Per position, the fair z-scores are combined with the game-model weights (the context-only metric gets weight 0 and the rest are rescaled to sum to 1):

```
composite = Σ wⱼ · fair zⱼ
fair score = 50 + 15 · (composite − position mean) / ‖w‖,   capped to 1–99
```

`‖w‖ = √Σ wⱼ²` is the true-talent spread of the weighted sum, so a score of 65 means one true-talent standard deviation above the average player in that position. The **fair rank** orders all 489 players by this score; the **position rank** orders the players of one position and is the number the app leads with. Goal-based data says much less about defenders and goalkeepers, so their scores stay close to 50 (posterior means), and an overall list across positions mostly sorts by position.

| Balanced weights | G+A | Attack | Defence | Discipline |
|---|---:|---:|---:|---:|
| Forwards | 47% | 33% | 7% | 13% |
| Midfielders | 27% | 33% | 27% | 13% |
| Defenders | 14% | 14% | 57% | 14% |
| Goalkeepers | 0% | 0% | 86% | 14% |

Attacking and Defensive presets shift these weights; *Find your star* also allows custom weights.

### 8. Traditional score (`engine.raw_score`)

What a standard list rewards, standardised within each position:

```
traditional = 50 + 15 · z( ½ · z(goals + assists, season total) + ½ · z(log market value) )
```

### 9. Flags

| Flag | Rule |
|---|---|
| **Hidden talent** | Fair rank in the top 15% **and** the traditional rank lies outside the player's own 80% fair-rank range (worse than its 90th percentile) — the gap is bigger than his sampling noise. 9 players in 2025/26. |
| **Priced above output** | Traditional rank in the top 15%, at least 74 places (15% of the pool) lower on the fair ranking, the traditional rank above the 80% fair-rank range, and confidence not *Low*. 10 players. It is not a prediction about his future (there is no maturity data); it says price and reputation run ahead of the on-pitch numbers. |
| **Watch live** | Fair rank in the top 25% from fewer than 900 minutes — promising numbers from a small sample |
| **Transfer opportunity** | Contract ends 1 Jul 2026 – 30 Jun 2027 and the fair rank is in the top 25% — a cheap or free target for a buying club, a contract to review for his own club |

### 10. How certain is a rank?

- **Rank range (Monte Carlo):** each player is re-scored 400 times with his own sampling noise added — the posterior standard deviation `√(k / (90s + k))` in true-talent units. The 10th–90th percentile of his rank is shown as the likely range.
- **Confidence:** *High* if that range covers less than a third of the pool, *Medium* up to two thirds, *Low* above. Defenders and goalkeepers are usually *Low*, because goal-based data says little about defending.
- **Robustness:** 2,000 random weightings of the four scored metrics (Dirichlet); the share in which the player makes the overall top 10.

### 11. Explaining a score

Because the fair score is a weighted sum, it splits exactly into points per metric:

```
points for metric j = 15 · wⱼ · (fair zⱼ − position mean) / ‖w‖
fair score = 50 + Σ points
```

Each part is further split into *on-pitch performance* (raw z) and *context correction* (age and club strength). *Compare* subtracts two of these breakdowns, so every point of a gap is accounted for; gaps under half a point are reported as *practically level*.

### 12. Similar players

100 minus the average gap in position percentiles over the four scored metrics, within the same position. (Cosine similarity was used before; it ignored the level and rated a star and a fringe player with the same profile shape as 100% similar.)

### 13. Potential (`step6_export.py`, not shown in the app)

A gradient-boosted quantile regression predicts log market value three years ahead from current value, age, fair score and club Elo, trained on earlier seasons with a time split (train ≤ 2019, test 2020–22). Its rank correlation with today's market value is 0.97 and with the fair score 0.12, so it is a **market-value forecast**, not a measure of ability. It is therefore not shown as "potential" in the app.

### 14. Bias audit

- Birth quarters of the pool against an even spread: χ² test.
- Birth quarters of the top 20, top 10% and top 20% of each ranking: Fisher's exact test (Q1 vs Q4) and the four-fifths (80%) rule.

### In-browser engine and verification

`src/engine/` is a line-by-line port of the scoring layer (steps 5–11 above), using numpy-compatible rounding and percentiles, the same OLS with t-distribution p-values, and a seeded random generator for the Monte Carlo. `npm run verify` re-runs it on `server/data/` and prints the comparison with the exported files.

The files in `server/data/` are the engine's current output: after an engine change, `npm run export` writes the JavaScript engine's ranks, scores, flags and rank ranges back into `data.json` and the CSV (player order is kept, because the Monte Carlo draws follow it). `npm run verify` then reports exact agreement on fair ranks, scores, flags, confidence and rank ranges.

---

## Updating the data for a new season

1. Download the new Transfermarkt export.
2. Set `HT_INPUT` (folder with the Transfermarkt CSVs) and `HT_OUT` (working folder), then run the steps in order from `engine-python/` (`step1_elo.py`, `step2_playergames.py`, `step3_playerseason.py`, `step4b_shrink.py`, `step5_backtest.py`, `step6_export.py`).
3. Sign in as sporting director → user menu → **Update player data**, and choose the new `data.json` and `hidden_talent_*.csv`. The previous files are kept in `server/data/backups/`.

`step6_export.py` writes nationality into `data.json` (`country`); for the 2025/26 files it is provided separately in `nationality_2025_26.csv`.

---

## Security

- All data and pages require sign-in; data files are not publicly reachable.
- Role rules are enforced on the server; restricted fields are removed before sending.
- Passwords: scrypt with a per-user salt. Sessions: signed, 8-hour, HttpOnly, SameSite=Strict cookies, re-checked against the account on every request.
- Login is rate-limited (8 failed attempts per IP per 10 minutes).
- Uploads: sporting director only, JSON only, 8 MB limit, validated before they replace the data.
- Static files: path-traversal protected; security headers including a Content Security Policy, `X-Frame-Options: DENY` and `nosniff`.
- `server/demo-users.json`, `server/users.json` and `server/.session-secret` are excluded from git. Replace demo accounts before giving anyone access.

---

## Limitations

- **Professional football only.** Academy players are not in the data.
- **No individual defensive actions** (tackles, interceptions, duels). Defending is measured only through the team's goals conceded while the player is on the pitch, which is mostly noise; weights on defence therefore move the ranking less than their percentage suggests, and defenders' and goalkeepers' ranks are less certain.
- **Club-strength correction removes the full club link.** Strong clubs also sign better players, so part of what is removed may be real quality. The next step is to estimate the team effect from players who changed clubs.
- **Plus-minus is not adjusted for team-mates**; a player sharing the pitch with strong team-mates shares their impact.
- **No biological-maturity data** (growth, sitting height); birth quarter is audited instead.
- **The birth-date test** compares against an even 25% per quarter rather than national birth statistics; with a 2.7× gap this does not change the conclusion.
- **No validated back-test yet.** `step5_backtest.py` exists but has not been re-run with the current engine; until it is, the app makes no claim about predicting future success.
- **Market-value-based fields** (traditional score, potential) reflect the transfer market, not ability. The traditional score stands for a reputation-based list, not for how a professional scout works.
- **Team attacking impact includes the player's own goals and assists**, so it overlaps with goals + assists per 90. The next engine run will use team-mates' goals only (`inv_on` is already computed in step 2).
- **Age is not corrected**: only exceptional 17-year-olds reach 450 minutes, so age shows no effect inside the pool. A historical age curve is the next step.

The app supports the scout's judgement; it does not replace it.

---

## Engine change log

Changes made to the original engine (applied to both the Python and the JavaScript versions):

| Change | Why |
|---|---|
| Fair score divided by the true-talent spread `‖w‖` instead of the spread of the shrunk estimates | The old scaling stretched goalkeepers and defenders 3.7× (attackers 1.6×), so noise reached the top of the overall ranking. Order within each position is unchanged. |
| Robustness: each random weighting uses its own position average and spread | Previously every weighting was centred and scaled with the Balanced values. |
| Similar players: average percentile gap instead of cosine similarity | Cosine ignored the level of a player. |
| Confidence: absolute bands (⅓, ⅔ of the pool) instead of thirds of the players | With thirds, a third of players were "High" by definition — e.g. a range of #3–#349 was labelled Medium. |
| Watch live: fair top 25% from under 900 minutes | The old rule used the potential forecast, which follows market value, and listed the lowest-ranked players at big clubs. |
| Strengths use the fair z directly | The z-score is already shrunk; a second reliability factor shrank it twice. |
| Nationality exported | For the country flags. |
| Hidden talent needs the traditional rank outside the player's 80% fair-rank range | Under the old rule 25 of 32 flagged players were within their own sampling noise. |
| "Early-peaker risk" renamed **Priced above output**, needs the gap to exceed the rank range, not shown at Low confidence | The dataset has no maturity data, and defenders' compressed scores made almost every expensive defender "drop". |
| Position rank is the headline number | Metrics say much less about defenders and goalkeepers, so the overall list mostly sorts by position. |
| Expiring contracts framed as transfer opportunities | The pool is the market, not one club's squad. |
| `data.json` and CSV re-exported from the current engine (`npm run export`) | The files were from the engine before the true-talent scaling fix (only 0.8% of fair ranks matched). |
| Pipeline paths from `HT_INPUT` / `HT_OUT`, `requirements.txt` added | Reproducible outside the original environment. |

---

## Licences and credits

- **Data:** Transfermarkt open data by David Cariboo, [transfermarkt-datasets](https://github.com/dcaribou/transfermarkt-datasets), CC0.
- **Fonts:** Manrope and Barlow Condensed, SIL Open Font License (licence files in `public/assets/`).
- **Flags:** [flag-icons](https://github.com/lipis/flag-icons), MIT licence.
- **UI template:** *abbbbb* (wine-and-gold scouting UI concept).
- **Engine:** Hidden Talent engine (Python), ported and extended for this app.
