import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
const meta = (n: number, type = "movie") => ({ id: `tt${String(n).padStart(7, "0")}`, name: `Film ${n}`, type, genres: ["Sci-Fi"], director: ["Christopher Nolan"] });
describe("GitHub Pages online catalog", () => {
  it("keeps stable IMDb identities and real fields without inventing votes, years or images", async () => {
    const { toMovie } = await import("./cinemeta");
    const movie = toMovie({ ...meta(816692), name: "Interstellar", year: "2014", imdbRating: "8.7", poster: "https://m.media-amazon.com/images/original.jpg" })!;
    expect(movie.imdbId).toBe("tt0816692");
    expect(movie.directors).toEqual(["Christopher Nolan"]);
    expect(movie.publicRating).toEqual({ value: 8.7, source: "IMDb via Cinemeta" });
    expect(toMovie({ ...meta(2), poster: "https://untrusted.example/p.jpg" })!.posterUrl).toBeUndefined();
    expect(toMovie(meta(2))!.year).toBeNull();
    expect(toMovie({ id: "wrong", name: "Wrong" })).toBeNull();
  });
  it("searches both films and series directly over HTTPS and paginates without a local API", async () => {
    const fetcher = vi.fn(async (input: string) => {
      const series = input.includes("/series/");
      const skip = Number(input.match(/skip=(\d+)/)?.[1] ?? 0);
      return new Response(JSON.stringify({ metas: Array.from({ length: 49 }, (_, i) => meta((series ? 10000 : 1) + skip + i, series ? "series" : "movie")) }));
    });
    vi.stubGlobal("fetch", fetcher);
    const { searchOnline } = await import("./cinemeta");
    const first = await searchOnline("space");
    const second = await searchOnline("space", 40);
    const third = await searchOnline("space", 80);
    expect(first).toHaveLength(40);
    expect(second).toHaveLength(40);
    expect(third).toHaveLength(40);
    expect(new Set([...first, ...second, ...third].map((m) => m.id)).size).toBe(120);
    expect(first.some((m) => m.mediaType === "tv")).toBe(true);
    expect(fetcher.mock.calls.every(([url]) => url.startsWith("https://v3-cinemeta.strem.io/"))).toBe(true);
    expect(fetcher.mock.calls.some(([url]) => url.includes("skip=50"))).toBe(true);
  });
  it("uses animation catalogs across both media types and stops duplicate search pages", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ metas: [{ ...meta(1), genres: ["Animation"] }] })));
    vi.stubGlobal("fetch", fetcher);
    const { searchOnline } = await import("./cinemeta");
    expect(await searchOnline("анімація")).toHaveLength(1);
    expect(fetcher.mock.calls.length).toBe(4);
    expect((fetcher.mock.calls as unknown as [string][]).every(([url]) => url.includes("genre=Animation"))).toBe(true);
    expect(await searchOnline("анімація", 40)).toHaveLength(0);
  });
  it("does not silently drop a failed media type and allows a retry", async () => {
    let failed = true;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => failed && url.includes("/series/") ? new Response("", { status: 503 }) : new Response(JSON.stringify({ metas: [meta(url.includes("/series/") ? 2 : 1)] }))));
    const { searchOnline } = await import("./cinemeta");
    await expect(searchOnline("test")).rejects.toThrow("retry");
    failed = false;
    const results = await searchOnline("test");
    expect(results).toHaveLength(2);
  });
  it("rejects unrelated or unclassified records in a genre response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ metas: [
      { ...meta(1), genres: ["Animation"] },
      { ...meta(2), genres: ["Documentary"] },
      { ...meta(3), genres: [] },
    ] }))));
    const { catalogPage } = await import("./cinemeta");
    const result = await catalogPage("movie", { genre: "Animation" });
    expect(result.map((m) => m.id)).toEqual(["tt0000001"]);
  });
});
