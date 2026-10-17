// DISTORT — Database initialization script
// Runs on first launch to create the SQLite schema + seed data.
//
// Uses better-sqlite3 (native, synchronous, fast) instead of Prisma CLI
// because the Prisma CLI binary is not bundled in the standalone build.
// The Prisma Client at runtime reads the schema from the generated client,
// so it doesn't need the CLI — just the query engine binary (which we copy
// separately via scripts/copy-standalone.mjs).
//
// This script is called from desktop/src/main.ts BEFORE spawning the Next.js
// server, so the tables exist by the time Prisma Client tries to connect.

import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";
import { app } from "electron";
import log from "electron-log";

const MODULE_NAME = "[db-init]";

export function initDatabase(dbPath: string): void {
  log.info(`${MODULE_NAME} Initializing database at ${dbPath}`);

  // Open the database (creates the file if it doesn't exist)
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL"); // better concurrency

  try {
    // Check if tables already exist (don't re-create if they do)
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='VpnServer'"
    ).get() as { name: string } | undefined;

    if (tables) {
      log.info(`${MODULE_NAME} Tables already exist — skipping schema creation`);
      return;
    }

    // Read + execute the schema SQL (creates tables)
    const schemaPath = getSchemaPath("schema.sql");
    if (!schemaPath) {
      throw new Error("Could not find schema.sql resource");
    }

    log.info(`${MODULE_NAME} Loading schema from ${schemaPath}`);
    const schemaSql = readFileSync(schemaPath, "utf-8");
    db.exec(schemaSql);
    log.info(`${MODULE_NAME} Schema created successfully`);

    // Read + execute the seed SQL (inserts default data)
    const seedPath = getSchemaPath("seed.sql");
    if (seedPath) {
      log.info(`${MODULE_NAME} Loading seed data from ${seedPath}`);
      const seedSql = readFileSync(seedPath, "utf-8");
      db.exec(seedSql);
      log.info(`${MODULE_NAME} Seed data inserted (30 servers + admin user + subscription)`);
    } else {
      log.warn(`${MODULE_NAME} seed.sql not found — skipping seed data`);
    }

  } catch (e) {
    log.error(`${MODULE_NAME} Failed to initialize database: ${(e as Error).message}`);
    throw e;
  } finally {
    db.close();
  }
}

function getSchemaPath(filename: string): string | null {
  // In development: desktop/resources/db/{filename}
  // In production (packaged): resources/db/{filename} (under process.resourcesPath)
  const isDev = !!process.env.DISTORT_DEV;

  const candidates = isDev
    ? [
        join(__dirname, "..", "resources", "db", filename),
        join(app.getAppPath(), "resources", "db", filename),
      ]
    : [
        join(process.resourcesPath, "db", filename),
        join(process.resourcesPath, "app", "resources", "db", filename),
      ];

  for (const candidate of candidates) {
    try {
      readFileSync(candidate, { flag: "r" });
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}
