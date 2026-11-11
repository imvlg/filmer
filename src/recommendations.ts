import type { Movie } from "./catalog";
import type { Entry } from "./db";
export interface TasteProfile {
  genres: Record<string, number>;
  directors: Record<string, number>;
  keywords: Record<string, number>;
  signals: number;
}
const norm = (v: string) => v.trim().toLowerCase();
const directorFeatures = (m: Movie) => [...new Set([
  ...(m.directorIds ?? []),
  ...(m.directors?.length ? m.directors : m.director ? [m.director] : []),
].filter(Boolean).map(norm))];
export function buildTasteProfile(
  movies: Movie[],
  entries: Entry[],
): TasteProfile {
  const profile: TasteProfile = {
    genres: {},
    directors: {},
    keywords: {},
    signals: 0,
  };
  const byId = new Map(movies.map((m) => [m.id, m]));
  for (const entry of entries) {
    const title = byId.get(entry.movieId);
    if (!title) continue;
    const signal =
      entry.status === "watchlist"
        ? 0.65
        : entry.status === "dismissed"
          ? -0.18
          : ((entry.rating ?? 5.5) - 5.5) / 2.25;
    if (Math.abs(signal) < 0.05) continue;
    profile.signals++;
    for (const [key, values] of [
      ["genres", title.genres],
      [
        "directors",
        directorFeatures(title),
      ],
      ["keywords", title.keywords ?? []],
    ] as const) {
      for (const feature of new Set(values.map(norm))) {
        profile[key][feature] = (profile[key][feature] ?? 0) + signal;
      }
    }
  }
  for (const key of ["genres", "directors", "keywords"] as const)
    for (const feature of Object.keys(profile[key])) {
      const value = profile[key][feature];
      profile[key][feature] = value / (Math.abs(value) + 2);
    }
  return profile;
}
export function recommend(movies: Movie[], entries: Entry[], limit = 200) {
  const profile = buildTasteProfile(movies, entries);
  const excluded = new Set(entries.map((e) => e.movieId));
  const eligible = movies.filter((m) => !excluded.has(m.id));
  const docFrequency = new Map<string, number>();
  for (const m of movies)
    for (const genre of new Set(m.genres.map(norm)))
      docFrequency.set(genre, (docFrequency.get(genre) ?? 0) + 1);
  const score = (m: Movie) => {
    let sum = 0;
    for (const genre of m.genres.map(norm))
      sum +=
        (profile.genres[genre] ?? 0) *
        (1 +
          Math.log(
            (movies.length + 1) / ((docFrequency.get(genre) ?? 0) + 1),
          )) *
        0.7;
    for (const director of directorFeatures(m))
      sum += (profile.directors[director] ?? 0) * 1.6;
    for (const keyword of (m.keywords ?? []).map(norm))
      sum += (profile.keywords[keyword] ?? 0) * 1.2;
    const rating = m.publicRating;
    if (rating)
      sum +=
        0.12 *
        ((rating.value - 5) / 5) *
        (rating.votes === undefined ? 0.5 : Math.min(1, Math.log10(1 + rating.votes) / 5));
    return sum;
  };
  const remaining = eligible.map((movie, index) => ({
    movie,
    score: score(movie),
    index,
  }));
  const result: typeof remaining = [];
  while (remaining.length && result.length < limit) {
    let best = 0,
      bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i],
        recent = result.slice(-3);
      const directors = directorFeatures(item.movie);
      const repeated = recent.filter((r) =>
        directorFeatures(r.movie).some((d) => directors.includes(d)),
      ).length;
      const adjusted = item.score - repeated * 0.28;
      if (adjusted > bestScore) {
        best = i;
        bestScore = adjusted;
      }
    }
    result.push(remaining.splice(best, 1)[0]);
  }
  return result.map((r) => ({ movie: r.movie, score: r.score }));
}
