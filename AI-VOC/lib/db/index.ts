import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { readEnv } from "../env.ts";

const defaultDbPath = path.join(process.cwd(), "aivoc.db");
const configuredDatabaseUrl = readEnv("DATABASE_URL");
const dbPath =
  configuredDatabaseUrl && configuredDatabaseUrl.startsWith("file:")
    ? configuredDatabaseUrl.replace(/^file:/, "")
    : defaultDbPath;

const schemaSql = `
CREATE TABLE IF NOT EXISTS app_registry (
  name TEXT PRIMARY KEY,
  play_id TEXT,
  app_store_id TEXT,
  category TEXT,
  icon_url TEXT,
  resolved_at INTEGER,
  source TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  apps TEXT NOT NULL,
  goal TEXT NOT NULL,
  focus_area TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  company_data TEXT
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  source TEXT NOT NULL,
  app TEXT NOT NULL,
  author TEXT,
  rating INTEGER,
  content TEXT NOT NULL,
  published_at INTEGER,
  source_url TEXT NOT NULL,
  raw_json TEXT,
  fetched_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS classifications (
  review_id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  sentiment TEXT NOT NULL,
  confidence REAL NOT NULL,
  classified_at INTEGER NOT NULL,
  model_used TEXT
);

CREATE TABLE IF NOT EXISTS report_references (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  topic TEXT,
  rank INTEGER
);

CREATE INDEX IF NOT EXISTS idx_reviews_report ON reviews(report_id);
CREATE INDEX IF NOT EXISTS idx_reviews_app ON reviews(app);
CREATE INDEX IF NOT EXISTS idx_class_topic ON classifications(topic);
`;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(schemaSql);

let initialized = false;

export async function initDb() {
  if (!initialized) {
    initialized = true;
  }
}

type QueryResult<T> = {
  rows: T[];
};

function isSelectQuery(text: string) {
  const normalized = text.trim().toUpperCase();
  return normalized.startsWith("SELECT") || normalized.startsWith("WITH");
}

function normalizeSql(text: string) {
  return text.replace(/\$\d+/g, "?");
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
  await initDb();
  const sql = normalizeSql(text);
  const statement = db.prepare(sql);
  if (isSelectQuery(text)) {
    return { rows: statement.all(...params) as T[] };
  }

  statement.run(...params);
  return { rows: [] as T[] };
}

type TransactionClient = {
  query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<QueryResult<T>>;
};

export async function withTransaction<T>(fn: (client: TransactionClient) => Promise<T>) {
  await initDb();
  db.prepare("BEGIN").run();
  const client: TransactionClient = {
    query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) => query<R>(text, params),
  };

  try {
    const result = await fn(client);
    db.prepare("COMMIT").run();
    return result;
  } catch (error) {
    db.prepare("ROLLBACK").run();
    throw error;
  }
}

export type ReportRow = {
  id: string;
  apps: string[] | string;
  goal: string;
  focus_area: string | null;
  status: string;
  created_at: number;
  completed_at: number | null;
  company_data: any;
};

export async function createReport(params: {
  id: string;
  apps: string[];
  goal: string;
  focus_area?: string | null;
  status: string;
  created_at: number;
  company_data?: unknown;
}) {
  await query(
    `INSERT INTO reports(id, apps, goal, focus_area, status, created_at, company_data)
     VALUES($1, $2, $3, $4, $5, $6, $7)`,
    [
      params.id,
      JSON.stringify(params.apps),
      params.goal,
      params.focus_area ?? null,
      params.status,
      params.created_at,
      JSON.stringify(params.company_data ?? { data: {}, market: null }),
    ]
  );
}

export async function updateReport(params: {
  id: string;
  status: string;
  completed_at: number | null;
  company_data?: unknown;
}) {
  await query(
    `UPDATE reports
     SET status = $1, completed_at = $2, company_data = $3
     WHERE id = $4`,
    [params.status, params.completed_at, JSON.stringify(params.company_data ?? null), params.id]
  );
}

export async function updateReportData(params: { id: string; status: string; company_data: unknown }) {
  await query(
    `UPDATE reports
     SET company_data = $1, status = $2
     WHERE id = $3`,
    [JSON.stringify(params.company_data), params.status, params.id]
  );
}

export async function getReport(id: string) {
  const result = await query<Omit<ReportRow, "apps" | "company_data"> & { apps: string; company_data: string | null }>(
    `SELECT * FROM reports WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) {
    return undefined;
  }
  return {
    ...row,
    apps: row.apps ? JSON.parse(row.apps) : [],
    company_data: row.company_data ? JSON.parse(row.company_data) : null,
  } as ReportRow;
}

export async function clearReferencesForReport(reportId: string) {
  await query(`DELETE FROM report_references WHERE report_id = $1`, [reportId]);
}

export async function insertReference(params: {
  id: string;
  report_id: string;
  review_id: string;
  topic: string | null;
  rank: number;
}) {
  await query(
    `INSERT OR REPLACE INTO report_references(id, report_id, review_id, topic, rank)
     VALUES($1, $2, $3, $4, $5)`,
    [params.id, params.report_id, params.review_id, params.topic, params.rank]
  );
}

export async function getAppRegistry(name: string) {
  const result = await query<{
    name: string;
    play_id: string | null;
    app_store_id: string | null;
    icon_url: string | null;
  }>(`SELECT name, play_id, app_store_id, icon_url FROM app_registry WHERE lower(name) = lower($1) LIMIT 1`, [name]);
  return result.rows[0];
}

export async function upsertAppRegistry(params: {
  name: string;
  play_id: string | null;
  app_store_id: string | null;
  category: string | null;
  icon_url: string | null;
  resolved_at: number;
  source: string;
}) {
  await query(
    `INSERT INTO app_registry(name, play_id, app_store_id, category, icon_url, resolved_at, source)
     VALUES($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(name) DO UPDATE SET
       play_id = excluded.play_id,
       app_store_id = excluded.app_store_id,
       category = COALESCE(excluded.category, app_registry.category),
       icon_url = COALESCE(excluded.icon_url, app_registry.icon_url),
       resolved_at = excluded.resolved_at,
       source = excluded.source`,
    [
      params.name,
      params.play_id,
      params.app_store_id,
      params.category,
      params.icon_url,
      params.resolved_at,
      params.source,
    ]
  );
}
