import { io } from "next/cache";
import { getDatabase } from "./client";
import { SqliteSessionRepository } from "./session-repo";

let repository: SqliteSessionRepository | undefined;

export async function getRepository(): Promise<SqliteSessionRepository> {
  await io();
  return repository ??= new SqliteSessionRepository(getDatabase(), io);
}
