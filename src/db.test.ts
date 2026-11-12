import "fake-indexeddb/auto";
import { afterEach, describe, it, expect } from "vitest";
import { FilmerDB, saveAction, removeEntry } from "./db";
const database = new FilmerDB("filmer-test");
afterEach(async () => {
  await database.entries.clear();
  await database.history.clear();
});
describe("persistent title lifecycle", () => {
  it("saves right swipes without duplicates and keeps history", async () => {
    await saveAction("movie:1", "watchlist", undefined, database);
    await saveAction("movie:1", "watchlist", undefined, database);
    expect(await database.entries.count()).toBe(1);
    expect(await database.history.count()).toBe(2);
  });
  it("records left swipes and survives a database reopen", async () => {
    await saveAction("movie:2", "dismissed", undefined, database);
    database.close();
    await database.open();
    expect((await database.entries.get("movie:2"))?.status).toBe("dismissed");
  });
  it("stores both catalog aliases under the same title", async () => {
    await saveAction("TT2278388", "dismissed", undefined, database);
    await saveAction("demo:grand-budapest", "watchlist", undefined, database);
    expect(await database.entries.toArray()).toMatchObject([
      { movieId: "demo:grand-budapest", status: "watchlist" },
    ]);
  });
  it("atomically moves saved titles to rated, edits ratings, and removes them", async () => {
    await saveAction("movie:3", "watchlist", undefined, database);
    await saveAction("movie:3", "rated", 8.5, database);
    expect(
      await database.entries.where("status").equals("watchlist").count(),
    ).toBe(0);
    expect((await database.entries.get("movie:3"))?.rating).toBe(8.5);
    await saveAction("movie:3", "rated", 7, database);
    expect((await database.entries.get("movie:3"))?.rating).toBe(7);
    await removeEntry("movie:3", database);
    expect(await database.entries.get("movie:3")).toBeUndefined();
    expect(await database.history.count()).toBe(4);
  });
  it("rejects invalid ratings without persisting partial changes", async () => {
    for (const value of [0, 10.5, 7.2, NaN])
      await expect(
        saveAction("bad", "rated", value, database),
      ).rejects.toThrow();
    expect(await database.entries.count()).toBe(0);
    expect(await database.history.count()).toBe(0);
  });
});
