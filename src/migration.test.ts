import "fake-indexeddb/auto";
import Dexie from "dexie";
import { it, expect } from "vitest";
import { FilmerDB } from "./db";
it("upgrades version 1 without changing existing ratings, watchlist or history", async () => {
  const name = "filmer-migration-test";
  const original = new Dexie(name);
  original
    .version(1)
    .stores({
      entries: "&movieId,status,updatedAt",
      history: "++id,movieId,at",
    });
  await original.table("entries").bulkPut([
    { movieId: "a", status: "rated", rating: 7.5, updatedAt: 10 },
    { movieId: "b", status: "watchlist", updatedAt: 11 },
  ]);
  await original
    .table("history")
    .add({ movieId: "a", action: "rated", rating: 7.5, at: 10 });
  original.close();
  const next = new FilmerDB(name);
  await next.open();
  expect((await next.entries.get("a"))?.rating).toBe(7.5);
  expect((await next.entries.get("b"))?.status).toBe("watchlist");
  expect(await next.history.count()).toBe(1);
  expect(await next.titles.count()).toBe(0);
  await next.delete();
});
