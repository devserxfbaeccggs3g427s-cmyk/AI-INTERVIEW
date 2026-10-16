"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Summary = {
  id: string;
  role: string;
  mode: string;
  provider: string;
  model: string;
  status: string;
  createdAt: number;
  questionsTotal: number;
};

const MODE_LABEL: Record<string, string> = { strict: "nghiêm khắc", coaching: "kèm góp ý" };
const STATUS_LABEL: Record<string, string> = {
  active: "đang chạy",
  complete: "hoàn tất",
  stopped_early: "dừng sớm",
};

export function SessionList() {
  const [sessions, setSessions] = useState<Summary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const response = await fetch("/api/sessions", { cache: "no-store" });
    setSessions(response.ok ? await response.json() : []);
  }

  useEffect(() => {
    reload().catch(() => setError("Không tải được danh sách phiên"));
  }, []);

  async function remove(id: string) {
    if (!window.confirm("Xoá phiên này cùng toàn bộ transcript và báo cáo của nó?")) return;
    const response = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Không xoá được phiên");
      return;
    }
    await reload();
  }

  async function purgeAll() {
    if (!window.confirm("Xoá TOÀN BỘ dữ liệu phiên và cấu hình AI trên máy chủ? Không hoàn tác được.")) return;
    const response = await fetch("/api/purge", { method: "POST" });
    if (!response.ok) {
      setError("Không xoá được dữ liệu");
      return;
    }
    await reload();
  }

  if (error) return <p role="alert">{error}</p>;
  if (!sessions) return <p>Đang tải danh sách phiên…</p>;

  return (
    <section>
      <p>
        Ứng dụng không có đăng nhập: mọi người dùng chung máy chủ này đều thấy và xoá được mọi phiên.
      </p>
      {sessions.length === 0 ? (
        <p>Chưa có phiên nào.</p>
      ) : (
        <ul className="sessions">
          {sessions.map((session) => (
            <li key={session.id}>
              <Link href={`/sessions/${session.id}`}>{session.role}</Link>
              <span>
                {" — "}
                {session.provider}/{session.model}
                {" · "}
                {MODE_LABEL[session.mode] ?? session.mode}
                {" · "}
                {STATUS_LABEL[session.status] ?? session.status}
                {" · "}
                {session.questionsTotal} câu
                {" · "}
                {new Date(session.createdAt).toLocaleString("vi-VN")}
              </span>
              <button type="button" onClick={() => remove(session.id)}>
                Xoá phiên
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={purgeAll} disabled={sessions.length === 0}>
        Xoá toàn bộ dữ liệu
      </button>
    </section>
  );
}