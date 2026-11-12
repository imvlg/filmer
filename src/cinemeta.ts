import type { Movie } from "./catalog";

// Public metadata only: no streams, playback, accounts or private API keys.
export const CINEMETA = "https://v3-cinemeta.strem.io";
type Media = "movie" | "series";
export interface Meta {
  id?: string;
  imdb_id?: string;
  type?: string;
  name?: string;
  year?: string;
  releaseInfo?: string;
  genres?: string[];
  genre?: string[];
  director?: string[] | string;
  cast?: string[] | string;
  country?: string[] | string;
  language?: string[] | string;
  keywords?: string[] | string;
  description?: string;
  runtime?: string;
  poster?: string;
  imdbRating?: string;
}
const requests = new Map<string, Promise<{ metas?: Meta[]; meta?: Meta; id?: string }>>();
function textList(value?: string | string[]) {
  return (Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;]/) : [])
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim());
}
async function request(path: string) {
  let pending = requests.get(path);
  if (!pending) {
    pending = fetch(`${CINEMETA}/${path}`, { signal: AbortSignal.timeout(15000) })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Online catalog: ${response.status}`);
        return response.json();
      });
    requests.set(path, pending);
    pending.catch(() => requests.delete(path));
    // Cache successful requests for this browsing session, with a bounded size.
    if (requests.size > 100) requests.delete(requests.keys().next().value!);
  }
  return pending;
}
export function toMovie(meta: Meta): Movie | null {
  const id = meta.imdb_id ?? meta.id ?? "";
  if (!/^tt\d{5,12}$/.test(id) || !meta.name) return null;
  const year = Number((meta.year ?? meta.releaseInfo ?? "").match(/^\d{4}/)?.[0]);
  const rating = Number(meta.imdbRating);
  const poster = meta.poster;
  const trustedPoster = poster && /^https:\/\/(m\.media-amazon\.com|images\.metahub\.space)\//.test(poster);
  return {
    id, imdbId: id, mediaType: meta.type === "series" ? "tv" : "movie",
    title: meta.name, year: year || null, genres: meta.genres ?? meta.genre ?? [],
    director: Array.isArray(meta.director) ? meta.director.join(", ") : meta.director ?? "",
    directors: Array.isArray(meta.director) ? meta.director : meta.director ? [meta.director] : [],
    cast: textList(meta.cast).slice(0, 8),
    countries: textList(meta.country),
    languages: textList(meta.language),
    keywords: textList(meta.keywords),
    synopsis: meta.description ?? "", runtime: meta.runtime ?? "",
    palette: ["#d3b896", "#ead8bb", "#657e73"], art: "city",
    ...(trustedPoster ? { posterUrl: poster } : {}),
    ...(rating > 0 && rating <= 10 ? { publicRating: { value: rating, source: "IMDb via Cinemeta" } } : {}),
  };
}
export async function catalogPage(type: Media, options: { search?: string; genre?: string; skip?: number } = {}) {
  const extras = Object.entries(options).filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`).join("&");
  const data = await request(`catalog/${type}/top${extras ? "/" + extras : ""}.json`);
  return (data.metas ?? []).map(toMovie).filter((m): m is Movie => m !== null)
    .filter((m) => !options.genre || m.genres.includes(options.genre));
}
export async function titleDetails(id: string, type: Media): Promise<Movie | null> {
  if (!/^tt\d{5,12}$/.test(id)) return null;
  const data = await request(`meta/${type}/${id}.json`);
  const movie = data.meta ? toMovie(data.meta) : null;
  return movie ? { ...movie, metadataComplete: true } : null;
}
export async function onlineStatus() {
  const data = await request("manifest.json");
  if (data.id !== "com.linvo.cinemeta") throw new Error("Unexpected catalog provider");
  return { provider: "Cinemeta" };
}

type QueryState = { movies: Movie[]; page: number; finished: boolean; pending?: Promise<void> };
const queries = new Map<string, QueryState>();
const animation = new Set(["animation", "анімація", "мультики", "cartoons", "мультфільми"]);
export async function searchOnline(query: string, offset = 0) {
  const key = query.trim().toLocaleLowerCase();
  let state = queries.get(key);
  if (!state) {
    state = { movies: [], page: 0, finished: false };
    queries.set(key, state);
    if (queries.size > 12) queries.delete(queries.keys().next().value!);
  }
  const target = state;
  while (target.movies.length < offset + 40 && !target.finished) {
    if (!target.pending) {
      target.pending = (async () => {
        const results = await Promise.allSettled((["movie", "series"] as const).map((type) =>
          catalogPage(type, { ...(animation.has(key) ? { genre: "Animation" } : { search: query.trim() }), skip: target.page * 50 }),
        ));
        const successful = results.filter((r): r is PromiseFulfilledResult<Movie[]> => r.status === "fulfilled");
        if (!successful.length) throw new Error("The online catalog is unavailable.");
        // Don't silently lose one media type or advance its page after an outage.
        if (successful.length !== results.length) throw new Error("Some catalog results are unavailable. Please retry.");
        const next: Movie[] = [];
        for (let i = 0; i < Math.max(...successful.map((r) => r.value.length)); i++)
          for (const result of successful) if (result.value[i]) next.push(result.value[i]);
        if (!target.page) next.sort((a, b) => Number(b.title.toLocaleLowerCase() === key) - Number(a.title.toLocaleLowerCase() === key));
        const oldCount = target.movies.length;
        target.movies = [...new Map([...target.movies, ...next].map((m) => [m.id, m])).values()];
        target.finished = !next.length || target.movies.length === oldCount;
        target.page++;
      })().finally(() => { target.pending = undefined; });
    }
    await target.pending;
  }
  return target.movies.slice(offset, offset + 40);
}
