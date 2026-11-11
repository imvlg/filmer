import Dexie, { type Table } from "dexie";
import type { Movie } from "./catalog";
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
  await database.transaction(
    "rw",
    database.entries,
    database.history,
    async () => {
      const at = Date.now();
      await database.entries.put({
        movieId,
        status,
        ...(status === "rated" ? { rating } : {}),
        updatedAt: at,
      });
      await database.history.add({
        movieId,
        action: status,
        ...(status === "rated" ? { rating } : {}),
        at,
      });
    },
  );
}
export async function removeEntry(movieId: string, database = db) {
  await database.transaction(
    "rw",
    database.entries,
    database.history,
    async () => {
      await database.entries.delete(movieId);
      await database.history.add({ movieId, action: "remove", at: Date.now() });
    },
  );
}
export async function revisitDismissed() {
  await db.transaction("rw", db.entries, db.history, async () => {
    const entries = await db.entries
      .where("status")
      .equals("dismissed")
      .toArray();
    await db.entries.bulkDelete(entries.map((e) => e.movieId));
    await db.history.bulkAdd(
      entries.map((e) => ({
        movieId: e.movieId,
        action: "reset-dismissed" as const,
        at: Date.now(),
      })),
    );
  });
}
