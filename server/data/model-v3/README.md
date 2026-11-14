# Scoutee engine v3

This directory contains calculation-only v3 model output. The current application does not read these files yet.

The model uses the canonical synthetic development dataset and must not be represented as real scouting analysis.

## Outputs

- `engine_v3.json`: authoritative nested model result for the future API and interface.
- `canonical_rankings.json`: compact single-source ranking contract for every application page.
- `engine_v3_players.csv`: flat review/export version of the same result.
- `model_report.json`: model validation and confidence summary.

## Rating design

- Individual shot, creation, progression, retention, defending, pressing, aerial and physical evidence replaces team goal difference as the primary signal.
- Goalkeepers use shot stopping, distribution, command of crosses and sweeping.
- Defensive activity is adjusted for possession opportunity.
- Small samples are pulled toward the position average.
- Each tactical role has its own category weights.
- Category covariance is included when scaling a composite score.
- A conservative, capped context correction removes only part of the remaining club-Elo relationship.
- Correlated Monte Carlo simulations produce score and position-rank ranges.
- Position rank is authoritative. Overall rank remains experimental.
- Traditional and fair comparisons are position-specific and use the same position pool.
- Hidden Talent and Priced Above Output flags must exceed the player's simulated fair-rank interval.
- Exact category and context contributions add back to the displayed score.
- Market value is excluded from the ability score.

## Commands

```bash
npm run engine:v3
npm run engine:v3:validate
```

