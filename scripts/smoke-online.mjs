import assert from "node:assert/strict";
import { catalogPage, titleDetails, searchOnline, onlineStatus } from "../src/cinemeta.ts";
import { buildTasteProfile, recommend } from "../src/recommendations.ts";

// Node's generic UA is blocked by the catalog CDN; browsers send their normal UA.
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, options) => nativeFetch(input, { ...options, headers: { ...options?.headers, "User-Agent": "Mozilla/5.0", Origin: "https://example.github.io" } });
assert.equal((await onlineStatus()).provider, "Cinemeta");
const seed = await titleDetails("tt0816692", "movie");
assert.equal(seed?.title, "Interstellar");
assert(seed.directors.includes("Christopher Nolan"));
const search = await searchOnline("Interstellar");
assert.equal(search[0].id, "tt0816692");
const tv = await searchOnline("Breaking Bad");
assert(tv.some((m) => m.id === "tt0903747" && m.mediaType === "tv"));
const animated = await searchOnline("animation");
assert(animated.length > 20);
assert(animated.some((m) => m.mediaType === "tv"));
assert(animated.every((m) => m.genres.includes("Animation")));
const pages = await Promise.all([catalogPage("movie", { genre: "Sci-Fi" }), catalogPage("movie", { genre: "Sci-Fi", skip: 50 }), catalogPage("movie", { genre: "Adventure" })]);
const pool = [...new Map([seed, ...pages.flat()].map((m) => [m.id, m])).values()];
const entries = [{ movieId: seed.id, status: "rated", rating: 10, updatedAt: 1 }];
const ranked = recommend(pool, entries);
assert(!ranked.some((r) => r.movie.id === seed.id));
assert(ranked.slice(0, 12).some((r) => r.movie.director.includes("Christopher Nolan")));
const source = new URL("../dist/", import.meta.url);
const { readdir, readFile } = await import("node:fs/promises");
for (const file of await readdir(new URL("assets/", source))) {
  if (!file.endsWith(".js")) continue;
  const text = await readFile(new URL(`assets/${file}`, source), "utf8");
  assert(!/127\.0\.0\.1:8787|\/api\/poster|\/api\/candidates|localhost:8787/.test(text), "Production bundle must not depend on a local backend");
}
const posterResponse = await nativeFetch(seed.posterUrl, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) });
assert(posterResponse.ok && posterResponse.headers.get("content-type")?.startsWith("image/"));
console.log(JSON.stringify({ provider: "Cinemeta", search: search.length, animation: animated.length, profile: buildTasteProfile([seed], entries), recommendations: ranked.slice(0, 12).map((r) => r.movie.title), poster: posterResponse.status, backendRequired: false }, null, 2));
