import "fake-indexeddb/auto";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { db } from "./db";
import { buildTasteProfile } from "./recommendations";
import { searchCatalog } from "./catalogService";
afterEach(() => vi.unstubAllGlobals());
afterAll(() => db.delete());
it("hydrates sparse search matches before feedback and retains full metadata after later search", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/meta/")) return new Response(JSON.stringify({ meta: {
      id: "tt0816692", name: "Interstellar", type: "movie", director: ["Christopher Nolan"], genres: ["Adventure", "Sci-Fi"], imdbRating: "8.7",
    } }));
    return new Response(JSON.stringify({ metas: url.includes("/series/") ? [] : [{ id: "tt0816692", name: "Interstellar", type: "movie", releaseInfo: "2014" }] }));
  }));
  const first = await searchCatalog("Interstellar");
  expect(first[0].directors).toEqual(["Christopher Nolan"]);
  const profile = buildTasteProfile(first, [{ movieId: first[0].id, status: "rated", rating: 10, updatedAt: 1 }]);
  expect(profile.directors["christopher nolan"]).toBeGreaterThan(0);
  expect(profile.genres["sci-fi"]).toBeGreaterThan(0);
  const second = await searchCatalog("Interstellar");
  expect(second[0].directors).toEqual(["Christopher Nolan"]);
  expect(second[0].genres).toContain("Sci-Fi");
  expect(second[0].publicRating?.votes).toBeUndefined();
});
