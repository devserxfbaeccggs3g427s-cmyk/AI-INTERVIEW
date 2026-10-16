import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>Luyện phỏng vấn AI</h1>
      <p>Khung dự án đã dựng xong.</p>
      <p>
        <Link href="/sessions">Lịch sử phiên</Link>
      </p>
    </main>
  );
}