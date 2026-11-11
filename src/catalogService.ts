import { catalog, type Movie } from "./catalog";
import { db, type Entry } from "./db";
import manifests from "./imdb-posters.json";
import { buildTasteProfile } from "./recommendations";
import { catalogPage, onlineStatus, searchOnline, titleDetails } from "./cinemeta";

const legacy = new Map(Object.entries(manifests).map(([id, p]) => [p.imdbId, id]));
export function imdbId(movie: Movie) {
  return movie.imdbId ?? manifests[movie.id as keyof typeof manifests]?.imdbId ?? movie.id;
}
function normalize(movie: Movie): Movie {
  const id = legacy.get(movie.id) ?? movie.id;
  const original = catalog.find((m) => m.id === id);
  return { ...original, ...movie, id, imdbId: movie.imdbId ?? movie.id,
    synopsis: movie.synopsis || original?.synopsis || "",
    director: movie.director || original?.director || "" };
}
async function cache(titles: Movie[]) {
  const normalized = titles.map(normalize);
  const previous = await db.titles.bulkGet(normalized.map((m) => m.id));
  const merged = normalized.map((m, i) => {
    const old = previous[i];
    if (!old) return m;
    return { ...old, ...m,
      genres: m.genres.length ? m.genres : old.genres,
      director: m.director || old.director,
      directors: m.directors?.length ? m.directors : old.directors,
      directorIds: m.directorIds?.length ? m.directorIds : old.directorIds,
      synopsis: m.synopsis || old.synopsis,
      runtime: m.runtime || old.runtime,
      metadataComplete: m.metadataComplete || old.metadataComplete,
    };
  });
  await db.titles.bulkPut(merged);
  return merged;
}
export async function ensureTitle(movie: Movie) {
  const known = await db.titles.get(movie.id) ?? movie;
  if (known.metadataComplete) return known;
  try {
    const detailed = await titleDetails(imdbId(known), known.mediaType === "tv" ? "series" : "movie");
    if (detailed) return (await cache([detailed]))[0];
  } catch { /* An outage must never prevent saving a user's action. */ }
  return known;
}
export interface CatalogStatus { provider: string }
export async function catalogStatus(): Promise<CatalogStatus | null> {
  try { return await onlineStatus(); } catch { return null; }
}
export async function initialCatalog(_entries: Entry[]) {
  const cached = await db.titles.toArray();
  const fresh: Movie[] = [];
  const popular = await Promise.allSettled([catalogPage("movie"), catalogPage("series")]);
  for (const result of popular) if (result.status === "fulfilled") fresh.push(...result.value);
  const fetched = await cache(fresh);
  return [...new Map([...catalog, ...cached, ...fetched].map((m) => [m.id, m])).values()];
}
export async function enrichSavedTitles(entries: Entry[], movies: Movie[], onBatch: (titles: Movie[]) => void) {
  // Resolve legacy titles in background; even an offline service cannot block startup.
  const lookup = [...new Set([...catalog.map(imdbId), ...entries.map((e) => imdbId(movies.find((m) => m.id === e.movieId) ?? { id: e.movieId } as Movie))])];
  for (let i = 0; i < lookup.length; i += 4) {
    const found = await Promise.allSettled(lookup.slice(i, i + 4).map(async (id) => {
      const known = movies.find((m) => imdbId(m) === id);
      if (known?.directors?.length && known.posterUrl) return known;
      return titleDetails(id, known?.mediaType === "tv" ? "series" : "movie");
    }));
    const batch = found.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
    if (!batch.length && found.every((r) => r.status === "rejected")) return;
    onBatch(await cache(batch));
  }
}
export async function searchCatalog(query: string, offset = 0) {
  const titles = await cache(await searchOnline(query, offset));
  // Enrich the first visible matches; all other titles enrich when selected/saved/rated.
  const detailed = await Promise.all(titles.slice(0, 6).map(ensureTitle));
  return [...detailed, ...titles.slice(6)];
}
const genreNames = new Map(["Action", "Adventure", "Animation", "Biography", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Mystery", "Romance", "Sci-Fi", "Sport", "Thriller", "War", "Western"].map((g) => [g.toLowerCase(), g]));
const pageOffsets = new Map<string, number>();
export async function moreCandidates(movies: Movie[], entries: Entry[]) {
  const profile = buildTasteProfile(movies, entries);
  const genres = Object.entries(profile.genres).filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([genre]) => genreNames.get(genre)).filter((g): g is string => Boolean(g));
  const excluded = new Set(entries.map((e) => e.movieId));
  const tasks = (genres.length ? genres : [undefined]).flatMap((genre) =>
    (["movie", "series"] as const).map(async (type) => {
      const key = `${type}:${genre ?? "popular"}`;
      let skip = pageOffsets.get(key) ?? 0;
      let titles = await catalogPage(type, { genre, skip });
      // Advance in 50-title source pages once the visible batch is mostly consumed.
      if (titles.length && titles.filter((m) => !excluded.has(normalize(m).id)).length < 15) {
        skip += 50;
        titles = await catalogPage(type, { genre, skip });
        pageOffsets.set(key, skip);
      }
      return titles;
    }),
  );
  const results = await Promise.allSettled(tasks);
  const successful = results.filter((r): r is PromiseFulfilledResult<Movie[]> => r.status === "fulfilled");
  if (!successful.length) throw new Error("Online discovery is unavailable");
  return cache(successful.flatMap((r) => r.value));
}
