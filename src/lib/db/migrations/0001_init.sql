CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  role TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('vi', 'en')),
  mode TEXT NOT NULL CHECK (mode IN ('strict', 'coaching')),
  length TEXT NOT NULL CHECK (length IN ('short', 'medium', 'long')),
  provider TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai', 'gemini', 'custom')),
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'complete', 'stopped_early')),
  config_json TEXT NOT NULL,
  cv_text TEXT
);

CREATE INDEX sessions_recent ON sessions(updated_at DESC, id DESC);

CREATE TABLE turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL CHECK (seq >= 0),
  role TEXT NOT NULL CHECK (role IN ('assistant', 'user')),
  text TEXT,
  blocks TEXT,
  synthetic INTEGER NOT NULL DEFAULT 0 CHECK (synthetic IN (0, 1)),
  created_at INTEGER NOT NULL,
  CHECK ((role = 'assistant' AND blocks IS NOT NULL AND text IS NULL AND synthetic = 0)
    OR (role = 'user' AND text IS NOT NULL AND blocks IS NULL)),
  UNIQUE (session_id, seq)
);

CREATE TABLE evaluations (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  partial INTEGER NOT NULL DEFAULT 0 CHECK (partial IN (0, 1))
);

CREATE TABLE ai_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  base_url TEXT,
  reasoning TEXT NOT NULL,
  call_mode TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
