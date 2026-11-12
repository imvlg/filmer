import type { Movie } from "./catalog";
import posters from "./imdb-posters.json";

const localIds = new Map(Object.entries(posters).map(([id, poster]) => [poster.imdbId, id]));

export function localTitleId(id: string) {
  return localIds.get(id.toLowerCase()) ?? (/^tt\d+$/i.test(id) ? id.toLowerCase() : id);
}

export function imdbId(movie: Movie) {
  if (movie.imdbId && /^tt\d+$/i.test(movie.imdbId)) return movie.imdbId.toLowerCase();
  return posters[movie.id as keyof typeof posters]?.imdbId ?? movie.id;
}

export function movieKey(movie: Movie) {
  return localTitleId(imdbId(movie));
}
