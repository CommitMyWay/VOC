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
