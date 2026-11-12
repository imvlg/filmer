import Dexie, { type Table } from "dexie";
import type { Movie } from "./catalog";
import { localTitleId } from "./titleIdentity";
export type Status = "watchlist" | "rated" | "dismissed";
export interface Entry {
  movieId: string;
  status: Status;
  rating?: number;
  updatedAt: number;
}
export interface History {
  id?: number;
  movieId: string;
  action: Status | "remove" | "reset-dismissed";
  rating?: number;
  at: number;
}
export class FilmerDB extends Dexie {
  entries!: Table<Entry, string>;
  history!: Table<History, number>;
  titles!: Table<Movie, string>;
  constructor(name = "filmer-v1") {
    super(name);
    this.version(1).stores({
      entries: "&movieId,status,updatedAt",
      history: "++id,movieId,at",
    });
    this.version(2).stores({ titles: "&id,imdbId" });
    this.version(3).stores({ entries: "&movieId,status,updatedAt" }).upgrade(async (transaction) => {
      const table = transaction.table<Entry, string>("entries");
      const existing = await table.toArray();
      const canonical = new Map<string, Entry>();
      const aliases = [];
      for (const entry of existing) {
        const movieId = localTitleId(entry.movieId);
        if (movieId !== entry.movieId) aliases.push(entry.movieId);
        const previous = canonical.get(movieId);
        if (!previous || previous.updatedAt <= entry.updatedAt) canonical.set(movieId, { ...entry, movieId });
      }
      if (aliases.length) {
        await table.bulkPut([...canonical.values()]);
        await table.bulkDelete(aliases);
      }
    });
  }
}
export const db = new FilmerDB();
export async function saveAction(
  movieId: string,
  status: Status,
  rating?: number,
  database = db,
) {
  if (
    status === "rated" &&
    (!Number.isFinite(rating) ||
      rating! < 1 ||
      rating! > 10 ||
      (rating! * 2) % 1 !== 0)
  )
    throw new Error("Choose a rating from 1 to 10 in half-star steps.");
  const id = localTitleId(movieId);
  return database.transaction(
    "rw",
    database.entries,
    database.history,
    async () => {
      const at = Date.now();
      const entry: Entry = {
        movieId: id,
        status,
        ...(status === "rated" ? { rating } : {}),
        updatedAt: at,
      };
      await database.entries.put(entry);
      await database.history.add({
        movieId: id,
        action: status,
        ...(status === "rated" ? { rating } : {}),
        at,
      });
      return entry;
    },
  );
}
export async function removeEntry(movieId: string, database = db) {
  const id = localTitleId(movieId);
  await database.transaction(
    "rw",
    database.entries,
    database.history,
    async () => {
      await database.entries.delete(id);
      await database.history.add({ movieId: id, action: "remove", at: Date.now() });
    },
  );
}
