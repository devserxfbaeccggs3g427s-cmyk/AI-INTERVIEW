import { Suspense } from "react";
import Link from "next/link";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { getRepository } from "@/lib/db/repository";
import type { SavedTurn } from "@/lib/db/session-repo";

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <main>
      <h1>Chi tiết phiên</h1>
      <p>
        <Link href="/sessions">← Về lịch sử phiên</Link>
      </p>
      <Suspense fallback={<p>Đang tải phiên…</p>}>
        <Transcript params={params} />
      </Suspense>
    </main>
  );
}

async function Transcript({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // IO runtime: driver đồng bộ nếu không có await io() thì bị đóng băng lúc build
  // và trả danh sách rỗng mà không báo lỗi. Xem docs/02-DESIGN.md §8.5.
  await io();
  const session = await (await getRepository()).load(id);
  if (!session) notFound();

  return (
    <article>
      <h2>{session.role}</h2>
      <p>
        {session.provider}/{session.model} — {session.language} — {session.mode} —{" "}
        {session.questionsTotal} câu — {new Date(session.createdAt).toLocaleString("vi-VN")}
      </p>

      <ol>
        {session.turns.map((turn) => (
          <li key={turn.seq}>
            <strong>{turn.role === "user" ? "Bạn" : "AI"}</strong>
            <p>{turnText(turn)}</p>
          </li>
        ))}
      </ol>

      {session.evaluation ? (
        <section>
          <h3>Báo cáo đánh giá{session.evaluation.partial ? " (phiên dừng sớm)" : ""}</h3>
          <pre className="probe">{JSON.stringify(session.evaluation.data, null, 2)}</pre>
        </section>
      ) : (
        <p>Phiên này chưa có báo cáo đánh giá.</p>
      )}

      {session.cvText ? (
        <details>
          <summary>CV đã trích ({session.cvText.length} ký tự)</summary>
          <p>{session.cvText}</p>
        </details>
      ) : null}
    </article>
  );
}

/**
 * Chỉ lấy phần chữ để hiển thị. `blocks` giữ nguyên định dạng của từng hãng để phát
 * lại được (docs/02-DESIGN.md §4.5), nên không phải khối nào cũng có `text` — khối
 * lạ thì hiện JSON thay vì bịa ra nội dung.
 */
function turnText(turn: SavedTurn): string {
  if (turn.role === "user") return turn.text;
  const text = turn.blocks
    .map((block) =>
      typeof block === "object" && block !== null && typeof (block as { text?: unknown }).text === "string"
        ? ((block as { text: string }).text)
        : "",
    )
    .join("")
    .trim();
  return text || JSON.stringify(turn.blocks, null, 2);
}