"use client";

import { useEffect, useState } from "react";

interface DbStatus { ok: boolean; dbPath: string; counters?: { sessions: number } }

export function FooterBar() {
  const [db, setDb] = useState<DbStatus | null>(null);
  useEffect(() => {
    fetch("/api/admin/db").then((r) => r.json()).then(setDb).catch(() => setDb({ ok: false, dbPath: "—" }));
  }, []);

  return (
    <footer className="w-full bg-surface-container-lowest py-space-sm mt-auto"
            style={{ borderTop: "1px solid var(--border-hairline)" }}>
      <div className="w-full px-gutter flex flex-col sm:flex-row items-center justify-between gap-space-xs text-on-surface-variant">
        <div className="flex items-center gap-space-sm label-code-sm">
          <div className="flex items-center gap-space-xs">
            <span className={`w-1.5 h-1.5 rounded-full ${db?.ok ? "bg-tertiary pulse-dot" : "bg-warning"}`} />
            <span className={db?.ok ? "text-tertiary" : "text-warning"}>
              SQLite Server-side: {db?.ok ? "Connected" : "Disconnected"}
            </span>
          </div>
          <span className="text-outline">|</span>
          <span className="text-secondary">{db?.dbPath ?? "—"} (WAL mode active)</span>
          {db?.counters ? (
            <>
              <span className="text-outline">|</span>
              <span className="text-secondary">{db.counters.sessions} sessions</span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-space-sm label-caps text-on-surface-variant">
          <span>Node {">="} 22 · node:sqlite</span>
          <span>•</span>
          <span>Zero Cloud Retention</span>
          <span>•</span>
          <span>BYOK / NFR-2</span>
        </div>
      </div>
    </footer>
  );
}
