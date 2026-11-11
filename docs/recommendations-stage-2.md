# Recommendations and remaining work

The production app is now fully static and uses Cinemeta metadata directly over HTTPS. No runtime Python API or local SQLite index is used.

`src/recommendations.ts` derives current taste from committed entries: Watchlist +0.65, dismissal -0.18, rating `(rating - 5.5) / 2.25` on the existing ten-point scale. Feature confidence is shrunk with `value / (abs(value) + 2)`. Genre frequency, director IDs/names, public-rating confidence and a recent-director penalty affect ranking. Missing vote counts remain missing. Current public metadata supplies descriptions and directors, but no structured story/mood feature model is implemented.

`src/cinemeta.ts` handles public movie/series metadata, query pagination and validation; `src/catalogService.ts` preserves legacy IDs, caches records and recalls positive-genre candidates. A high Interstellar rating is exercised against actual online data and raises Inception, The Prestige, Tenet and related science fiction. This confirms working mechanics, not subjective quality. Saved/rated/dismissed titles remain excluded. Cancelling a dialog has no effect.

Further work: evaluate with held-out interactions and real-user feedback, tune cold-start and diversity, add deliberate rare-title exploration and properly licensed theme/mood features.

Letterboxd remains unimplemented. A future CSV flow needs preview, ambiguous title/year matching, provenance, idempotence and conflict handling; convert five-star values with `stored = stars * 2`, preserve newer local ratings and keep watched-but-unrated neutral. CSV import is not live sync. Review the current official API access policy before any connector work.

- [Cinemeta](https://github.com/Stremio/stremio-addons/blob/master/docs/tutorial/using-cinemeta.md)
- [Letterboxd API policy](https://letterboxd.com/api-beta/)
- [Letterboxd export](https://letterboxd.zendesk.com/hc/en-us/articles/15179196880911-Can-I-get-a-copy-of-my-account-data)
