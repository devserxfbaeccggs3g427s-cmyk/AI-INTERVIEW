import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AiConfig, TranscriptTurn } from "../providers/types";

export type SessionConfig = {
  role: string;
  language: "vi" | "en";
  mode: "strict" | "coaching";
  length: "short" | "medium" | "long";
};
export type SessionStatus = "active" | "complete" | "stopped_early";
export type StoredSettings = Omit<AiConfig, "persistKey">;
export type CreateSession = {
  config: SessionConfig;
  ai: StoredSettings;
  cvText?: string | null;
};
export type SavedTurn = TranscriptTurn & { seq: number; createdAt: number };
export type SavedEvaluation = { data: unknown; partial: boolean; createdAt: number };
export type SessionSummary = SessionConfig & {
  id: string;
  provider: AiConfig["provider"];
  model: string;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
  questionsTotal: number;
};
export type SessionRecord = SessionSummary & {
  cvText: string | null;
  config: SessionConfig;
  turns: SavedTurn[];
  evaluation: SavedEvaluation | null;
};

export interface SessionRepository {
  create(input: CreateSession): Promise<{ id: string }>;
  load(id: string): Promise<SessionRecord | null>;
  appendTurn(id: string, turn: TranscriptTurn, expectedSeq?: number): Promise<void>;
  saveEvaluation(id: string, data: unknown, partial: boolean): Promise<void>;
  list(limit: number): Promise<SessionSummary[]>;
  delete(id: string): Promise<boolean>;
  purge(): Promise<number>;
  getSettings(): Promise<StoredSettings | null>;
  saveSettings(cfg: StoredSettings): Promise<void>;
}

type SessionRow = {
  id: string; created_at: number; updated_at: number; role: string;
  language: SessionConfig["language"]; mode: SessionConfig["mode"];
  length: SessionConfig["length"]; provider: AiConfig["provider"];
  model: string; status: SessionStatus; config_json: string; cv_text: string | null;
};
type TurnRow = { seq: number; role: "assistant" | "user"; text: string | null; blocks: string | null; synthetic: number; created_at: number };

function summary(row: SessionRow): SessionSummary {
  return {
    id: row.id, role: row.role, language: row.language, mode: row.mode,
    length: row.length, provider: row.provider, model: row.model, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at,
    questionsTotal: { short: 5, medium: 8, long: 12 }[row.length],
  };
}

export class SqliteSessionRepository implements SessionRepository {
  private readonly db: DatabaseSync;
  private readonly beforeRead: () => Promise<void>;

  constructor(db: DatabaseSync, beforeRead: () => Promise<void> = async () => {}) {
    this.db = db;
    this.beforeRead = beforeRead;
  }

  async create({ config, ai, cvText }: CreateSession): Promise<{ id: string }> {
    const id = randomUUID();
    const now = Date.now();
    this.db.prepare(`INSERT INTO sessions
      (id, created_at, updated_at, role, language, mode, length, provider, model, status, config_json, cv_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`).run(
      id, now, now, config.role, config.language, config.mode, config.length,
      ai.provider, ai.model, JSON.stringify(config), cvText ?? null,
    );
    return { id };
  }

  async load(id: string): Promise<SessionRecord | null> {
    await this.beforeRead();
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
    if (!row) return null;
    const turns = (this.db.prepare("SELECT * FROM turns WHERE session_id = ? ORDER BY seq").all(id) as TurnRow[]).map((turn): SavedTurn => {
      if (turn.role === "assistant") {
        return { seq: turn.seq, role: "assistant", blocks: JSON.parse(turn.blocks!), createdAt: turn.created_at };
      }
      return {
        seq: turn.seq, role: "user", text: turn.text!,
        ...(turn.synthetic ? { synthetic: true as const } : {}), createdAt: turn.created_at,
      };
    });
    const evaluation = this.db.prepare("SELECT data, partial, created_at FROM evaluations WHERE session_id = ?").get(id) as
      { data: string; partial: number; created_at: number } | undefined;
    return {
      ...summary(row), config: JSON.parse(row.config_json) as SessionConfig,
      cvText: row.cv_text, turns,
      evaluation: evaluation ? {
        data: JSON.parse(evaluation.data), partial: !!evaluation.partial, createdAt: evaluation.created_at,
      } : null,
    };
  }

  async appendTurn(id: string, turn: TranscriptTurn, expectedSeq?: number): Promise<void> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const next = this.db.prepare("SELECT COALESCE(MAX(seq) + 1, 0) AS seq FROM turns WHERE session_id = ?").get(id) as { seq: number };
      const seq = expectedSeq ?? next.seq;
      const now = Date.now();
      this.db.prepare(`INSERT INTO turns (session_id, seq, role, text, blocks, synthetic, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        id, seq, turn.role, turn.role === "user" ? turn.text : null,
        turn.role === "assistant" ? JSON.stringify(turn.blocks) : null,
        turn.role === "user" && "synthetic" in turn && turn.synthetic ? 1 : 0, now,
      );
      this.db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(now, id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async saveEvaluation(id: string, data: unknown, partial: boolean): Promise<void> {
    const now = Date.now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`INSERT INTO evaluations (session_id, data, created_at, partial) VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET data = excluded.data, created_at = excluded.created_at,
        partial = excluded.partial`).run(id, JSON.stringify(data), now, partial ? 1 : 0);
      this.db.prepare("UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?").run(partial ? "stopped_early" : "complete", now, id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async list(limit: number): Promise<SessionSummary[]> {
    await this.beforeRead();
    return (this.db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC, id DESC LIMIT ?").all(limit) as SessionRow[]).map(summary);
  }

  async delete(id: string): Promise<boolean> {
    return this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id).changes > 0;
  }

  async purge(): Promise<number> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const count = Number(this.db.prepare("DELETE FROM sessions").run().changes);
      this.db.exec("DELETE FROM ai_settings");
      this.db.exec("COMMIT");
      return count;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async getSettings(): Promise<StoredSettings | null> {
    await this.beforeRead();
    const row = this.db.prepare("SELECT provider, model, base_url, reasoning, call_mode FROM ai_settings WHERE id = 1").get() as
      { provider: AiConfig["provider"]; model: string; base_url: string | null; reasoning: AiConfig["reasoning"]; call_mode: AiConfig["callMode"] } | undefined;
    return row ? {
      provider: row.provider, model: row.model,
      ...(row.base_url ? { baseUrl: row.base_url } : {}),
      reasoning: row.reasoning, callMode: row.call_mode,
    } : null;
  }

  async saveSettings(cfg: StoredSettings): Promise<void> {
    this.db.prepare(`INSERT INTO ai_settings (id, provider, model, base_url, reasoning, call_mode, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET provider = excluded.provider, model = excluded.model,
        base_url = excluded.base_url, reasoning = excluded.reasoning,
        call_mode = excluded.call_mode, updated_at = excluded.updated_at`).run(
      cfg.provider, cfg.model, cfg.baseUrl ?? null, cfg.reasoning, cfg.callMode, Date.now(),
    );
  }
}
