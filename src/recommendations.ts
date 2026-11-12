import type { Movie } from "./catalog";
import type { Entry } from "./db";

type Scores = Record<string, number>;
const weights = {
  genres: .85, combinations: .35, directors: 1.25, cast: .52,
  keywords: .7, topics: .72, words: .3, era: .24, format: .18,
  length: .15, countries: .2, languages: .16,
};
type Facet = keyof typeof weights;
const facets = Object.keys(weights) as Facet[];
type Features = Record<Facet, string[]>;
export type TasteProfile = Record<Facet, Scores> & { signals: number };

const distinct = (values: string[]) => [...new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean))];
const stopWords = new Set("about after again along always among another around before being between both could during every first from have himself into later life lives made many more most must never once only other over people same some such than that their them then there these they this those time under until very want were what when where which while will with without world would years young your".split(" "));
const topicRules: Record<string, RegExp> = {
  space: /\b(astronauts?|spaceships?|space travel|space stations?|spacecraft|wormholes?|interstellar|alien planets?)\b/i,
  investigation: /\b(detectives?|investigat\w*|murder case|cold case|serial killers?)\b/i,
  heist: /\b(heists?|robbery|robberies|master thief|con artists?)\b/i,
  survival: /\b(surviv\w*|stranded|shipwreck\w*|apocalypse)\b/i,
  comingOfAge: /\b(coming.of.age|adolescen\w*|high school|growing up)\b/i,
  family: /\b(family secrets?|siblings?|estranged|generations?|parenthood)\b/i,
  relationships: /\b(romance|fall(?:s|ing)? in love|love affair|marriage|divorce|reunite\w*)\b/i,
  supernatural: /\b(ghosts?|haunt\w*|demons?|spirits?|curses?|witches?)\b/i,
  timeTravel: /\b(time travel\w*|time loop|alternate timeline|parallel universe\w*)\b/i,
  politics: /\b(political|government conspiracy|revolution|dictator\w*|elections?)\b/i,
  war: /\b(world war|battlefield|soldiers?|military|wartime|occupied)\b/i,
  music: /\b(musicians?|singers?|orchestra|rock band|songwriters?|composers?)\b/i,
  sport: /\b(championship|athletes?|boxing|football|basketball|racing driver)\b/i,
  technology: /\b(artificial intelligence|androids?|robots?|hackers?|virtual reality)\b/i,
  adventure: /\b(expedition|treasure hunt|quests?|explorers?|lost city)\b/i,
};
const featureCache = new WeakMap<Movie, Features>();

function features(movie: Movie): Features {
  const cached = featureCache.get(movie);
  if (cached) return cached;
  const genres = distinct(movie.genres).sort();
  const words = distinct((movie.synopsis.toLowerCase().match(/[a-z]{4,}/g) ?? [])
    .filter((word) => !stopWords.has(word))).slice(0, 24);
  const hours = movie.runtime.match(/(\d+)\s*h/i);
  const minutes = movie.runtime.match(/(\d+)\s*m/i);
  const duration = Number(hours?.[1] ?? 0) * 60 + Number(minutes?.[1] ?? 0);
  const result = {
    genres,
    combinations: genres.flatMap((genre, index) => genres.slice(index + 1).map((other) => genre + "/" + other)),
    directors: distinct([...(movie.directorIds ?? []), ...(movie.directors?.length ? movie.directors : movie.director ? [movie.director] : [])]),
    cast: distinct(movie.cast ?? []).slice(0, 5),
    keywords: distinct(movie.keywords ?? []),
    topics: Object.entries(topicRules).filter(([, rule]) => rule.test(movie.synopsis)).map(([topic]) => topic),
    words,
    era: movie.year ? [String(Math.floor(movie.year / 10) * 10)] : [],
    format: [movie.mediaType],
    length: duration ? [duration < 35 ? "short" : duration < 65 ? "episode" : duration < 115 ? "standard" : "long"] : [],
    countries: distinct(movie.countries ?? []),
    languages: distinct(movie.languages ?? []),
  };
  featureCache.set(movie, result);
  return result;
}

function affinity(entries: Entry[], movies: Movie[]) {
  const byId = new Map(movies.map((movie) => [movie.id, movie]));
  const latest = entries.reduce((time, entry) => Math.max(time, entry.updatedAt), 0);
  return entries.flatMap((entry) => {
    const movie = byId.get(entry.movieId);
    if (!movie) return [];
    const raw = entry.status === "watchlist" ? .72 : entry.status === "dismissed" ? -.2 :
      Math.max(-1.8, Math.min(2.25, ((entry.rating ?? 5.5) - 5.5) / 2));
    const ageDays = (latest - entry.updatedAt) / 86_400_000;
    const signal = raw * (.42 + .58 * Math.pow(.5, ageDays / 120));
    return Math.abs(signal) < .05 ? [] : [{ feature: features(movie), signal }];
  });
}

function profileFrom(feedback: ReturnType<typeof affinity>): TasteProfile {
  const scores = Object.fromEntries(facets.map((facet) => [facet, Object.create(null)])) as Record<Facet, Scores>;
  for (const { feature, signal } of feedback) {
    for (const facet of facets) {
      const values = feature[facet];
      const share = signal / Math.sqrt(Math.max(1, values.length));
      for (const value of values) scores[facet][value] = (scores[facet][value] ?? 0) + share;
    }
  }
  for (const facet of facets) {
    for (const value in scores[facet]) {
      const score = scores[facet][value];
      scores[facet][value] = score / (Math.abs(score) + 1.7);
    }
  }
  return { ...scores, signals: feedback.length };
}

export function buildTasteProfile(movies: Movie[], entries: Entry[]) {
  return profileFrom(affinity(entries, movies));
}

function overlap(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  return a.filter((v) => b.includes(v)).length / Math.sqrt(a.length * b.length);
}

function resemblance(a: Features, b: Features) {
  return .28 * overlap(a.genres, b.genres) + .24 * overlap(a.topics, b.topics) +
    .15 * overlap(a.words, b.words) + .15 * overlap(a.directors, b.directors) +
    .1 * overlap(a.cast, b.cast) + .08 * overlap(a.keywords, b.keywords);
}

export function recommend(movies: Movie[], entries: Entry[], limit = 200, historyPool = movies) {
  const feedback = affinity(entries, historyPool);
  const profile = profileFrom(feedback);
  const anchors = [...feedback].sort((a, b) => Math.abs(b.signal) - Math.abs(a.signal)).slice(0, 14);
  const excluded = new Set(entries.map((entry) => entry.movieId));
  const frequencies = new Map<string, number>();
  for (const movie of movies) {
    for (const genre of features(movie).genres) frequencies.set(genre, (frequencies.get(genre) ?? 0) + 1);
  }

  const remaining = movies.filter((movie) => !excluded.has(movie.id)).map((movie) => {
    const feature = features(movie);
    let score = 0;
    for (const facet of facets) {
      const values = feature[facet];
      const sum = values.reduce((total, value) => {
        const specificity = facet === "genres" ? 1 + Math.min(.55, Math.log((movies.length + 1) / ((frequencies.get(value) ?? 0) + 1)) * .18) : 1;
        return total + (profile[facet][value] ?? 0) * specificity;
      }, 0);
      score += weights[facet] * sum / Math.sqrt(Math.max(1, values.length));
    }
    const similarities = anchors.map((anchor) => anchor.signal * resemblance(feature, anchor.feature));
    const closestLike = Math.max(0, ...similarities);
    const closestDislike = Math.min(0, ...similarities);
    score += .48 * closestLike + .26 * closestDislike;

    const rating = movie.publicRating;
    if (rating) {
      const confidence = rating.votes === undefined ? .48 : rating.votes / (rating.votes + 500);
      score += .27 * (rating.value - 6.4) / 3.6 * confidence;
    }
    return { movie, feature, score, diversity: 0 };
  });

  const selected: { movie: Movie; score: number }[] = [];
  while (remaining.length && selected.length < limit) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const score = remaining[i].score - remaining[i].diversity;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    const [best] = remaining.splice(bestIndex, 1);
    selected.push({ movie: best.movie, score: bestScore });
    for (const candidate of remaining) {
      const sameDirector = overlap(best.feature.directors, candidate.feature.directors);
      const nearDuplicate = resemblance(best.feature, candidate.feature);
      candidate.diversity = .74 * candidate.diversity + .67 * sameDirector +
        .21 * nearDuplicate + .10 * overlap(best.feature.combinations, candidate.feature.combinations);
    }
  }
  return selected;
}
