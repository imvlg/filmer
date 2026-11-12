import { describe, it, expect } from "vitest";
import type { Movie } from "./catalog";
import type { Entry } from "./db";
import { buildTasteProfile, recommend } from "./recommendations";
const title = (
  id: string,
  genres: string[],
  director: string,
  keywords: string[] = [],
): Movie => ({
  id,
  imdbId: id,
  title: id,
  mediaType: "movie",
  year: 2020,
  genres,
  director,
  directorIds: [director],
  keywords,
  runtime: "",
  synopsis: "",
  palette: ["#fff", "#eee", "#333"],
  art: "city",
});
const interstellar = title(
  "interstellar",
  ["Adventure", "Drama", "Sci-Fi"],
  "nolan",
  ["space", "exploration"],
);
const inception = title("inception", ["Adventure", "Sci-Fi"], "nolan");
const arrival = title("arrival", ["Drama", "Sci-Fi"], "villeneuve", ["space"]);
const comedy = title("comedy", ["Comedy", "Romance"], "other");
const saved = (id: string): Entry => ({
  movieId: id,
  status: "watchlist",
  updatedAt: 1,
});
describe("taste-based ranking", () => {
  it("excludes a passed IMDb title even when the feed uses the demo alias", () => {
    const old = { ...arrival, id: "demo:grand-budapest", imdbId: "tt2278388" };
    const online = { ...old, id: "tt2278388" };
    expect(recommend([old, online, inception], []).map(({ movie }) => movie.id)).toHaveLength(2);
    const passed: Entry = { movieId: "tt2278388", status: "dismissed", updatedAt: 1 };
    expect(recommend([old, online, inception], [passed]).map(({ movie }) => movie.id)).toEqual([inception.id]);
  });
  it("changes discovery after a like and finds both director and genre affinity", () => {
    const ranked = recommend(
      [comedy, arrival, inception, interstellar],
      [saved("interstellar")],
    );
    expect(ranked.findIndex((r) => r.movie.id === "inception")).toBeLessThan(
      ranked.findIndex((r) => r.movie.id === "comedy"),
    );
    expect(ranked.findIndex((r) => r.movie.id === "arrival")).toBeLessThan(
      ranked.findIndex((r) => r.movie.id === "comedy"),
    );
    expect(ranked.some((r) => r.movie.id === "interstellar")).toBe(false);
  });
  it("excludes saved, rated and dismissed titles and restores removed feedback", () => {
    const entries: Entry[] = [
      saved("interstellar"),
      { movieId: "arrival", status: "rated", rating: 9, updatedAt: 2 },
      { movieId: "comedy", status: "dismissed", updatedAt: 3 },
    ];
    expect(
      recommend([comedy, arrival, inception, interstellar], entries).map(
        (r) => r.movie.id,
      ),
    ).toEqual(["inception"]);
    expect(
      recommend([comedy, arrival, inception, interstellar], []),
    ).toHaveLength(4);
  });
  it("uses stronger positive ratings than a watchlist save and only weak negative dismissals", () => {
    const movies = [interstellar];
    const liked = buildTasteProfile(movies, [saved("interstellar")]);
    const rated = buildTasteProfile(movies, [
      { movieId: "interstellar", status: "rated", rating: 10, updatedAt: 1 },
    ]);
    const dismissed = buildTasteProfile(movies, [
      { movieId: "interstellar", status: "dismissed", updatedAt: 1 },
    ]);
    expect(rated.genres["sci-fi"]).toBeGreaterThan(liked.genres["sci-fi"]);
    expect(Math.abs(dismissed.genres["sci-fi"])).toBeLessThan(
      liked.genres["sci-fi"],
    );
  });
  it("does not change ordering or score when feedback is unchanged (including modal cancellation)", () => {
    const movies = [interstellar, inception, arrival, comedy];
    const entries = [saved("interstellar")];
    expect(recommend(movies, entries)).toEqual(recommend(movies, entries));
  });
  it("reranks repeated directors so related films from others can enter the shortlist", () => {
    const same = Array.from({ length: 5 }, (_, i) =>
      title("nolan-" + i, ["Sci-Fi"], "nolan"),
    );
    const other = title("space-by-other", ["Sci-Fi"], "other", ["space"]);
    const result = recommend(
      [interstellar, ...same, other],
      [{ movieId: "interstellar", status: "rated", rating: 10, updatedAt: 1 }],
    );
    expect(
      result.slice(0, 4).some((r) => r.movie.id === "space-by-other"),
    ).toBe(true);
  });
  it("matches different wording for the same plot theme across directors", () => {
    const watched = { ...interstellar, synopsis: "Astronauts discover a wormhole.", keywords: [] };
    const related = { ...arrival, synopsis: "A spacecraft sets off for an alien planet.", keywords: [] };
    const unrelated = { ...arrival, id: "other-drama", synopsis: "A lawyer faces a difficult choice.", keywords: [] };
    const results = recommend([unrelated, related], [{ ...saved(watched.id), status: "rated", rating: 10 }], 2, [watched]);
    expect(results[0].movie.id).toBe(related.id);
  });
  it("uses cast affinity and weighs recent explicit feedback more heavily", () => {
    const older = { ...interstellar, cast: ["Actor A"] };
    const recent = { ...interstellar, id: "recent", cast: ["Actor B"] };
    const a = { ...arrival, cast: ["Actor A"] };
    const b = { ...arrival, id: "candidate-b", cast: ["Actor B"] };
    const history: Entry[] = [
      { ...saved(older.id), status: "rated", rating: 10 },
      { ...saved(recent.id), status: "rated", rating: 10, updatedAt: 365 * 86_400_000 },
    ];
    expect(recommend([a, b], history, 2, [older, recent])[0].movie.id).toBe(b.id);
  });
});
