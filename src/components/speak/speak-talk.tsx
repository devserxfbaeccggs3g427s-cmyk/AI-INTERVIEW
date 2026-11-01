"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Luyện giao tiếp (Nói) — S08 (AC-CM-04).
 *
 * ⚠️ AC-CM-04 — chấm nói dùng **MediaRecorder + STT** (Web Speech API):
 * ghi âm bằng MediaRecorder, chuyển giọng nói thành văn bản bằng
 * `SpeechRecognition`, rồi gửi phần transcript cho AI chấm rubric.
 *
 * ⚠️ Không có API key ⇒ nói rõ, KHÔNG giả lập.
 */

export interface TalkPromptDTO {
  id: string;
  title: string;
  prompt: string;
  lang: string | null;
  level: string | null;
  mode: string | null;
  minutes: number;
  isUserMade: boolean;
}

export interface SpeakTalkProps {
  prompts: TalkPromptDTO[];
  aiEnabled: boolean;
  initialPromptId?: string;
}

/** Ngưỡng dừng ghi âm tự động (giây) — tránh ghi quá lâu. */
const MAX_RECORDING_SECONDS = 300;

/**
 * Shape tối thiểu của Web Speech API `SpeechRecognition`.
 *
 * ⚠️ Không có type chính thức trong `lib.dom.d.ts` cho mọi trình duyệt ⇒
 * khai báo cục bộ, chỉ dùng đúng phần mình gọi.
 */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((event: {
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >;
      }) => void)
    | null;
  onerror: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function SpeakTalk({ prompts, aiEnabled, initialPromptId }: SpeakTalkProps) {
  const router = useRouter();

  const [promptId, setPromptId] = useState<string | null>(
    initialPromptId ?? prompts[0]?.id ?? null,
  );
  const [transcript, setTranscript] = useState("");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [grade, setGrade] = useState<{
    score: number;
    rubric: Record<string, number>;
    feedback: string;
    source: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<{
    stop: () => void;
    abort: () => void;
  } | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const prompt = prompts.find((p) => p.id === promptId) ?? null;

  // Dọn khi unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recognitionRef.current?.abort();
      mediaRecorderRef.current?.stop();
    };
  }, []);

  async function startRecording() {
    setError(null);
    setTranscript("");

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError("Trình duyệt không hỗ trợ ghi âm");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // ⚠️ AC-CM-04 — MediaRecorder cho phát lại + đo thời lượng.
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        for (const track of stream.getTracks()) track.stop();
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed((current) => {
          const next = current + 1;
          if (next >= MAX_RECORDING_SECONDS) {
            stopRecording();
          }
          return next;
        });
      }, 1000);

      // ⚠️ STT — Web Speech API (không phải AI, chạy ở trình duyệt).
      const speechWindow = window as unknown as {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
      };
      const RecognitionCtor =
        speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

      if (RecognitionCtor) {
        const recognition = new RecognitionCtor();
        recognition.lang = prompt?.lang === "vi" ? "vi-VN" : "en-US";
        recognition.continuous = true;
        recognition.interimResults = false;

        recognition.onresult = (event) => {
          let text = "";
          for (let i = 0; i < event.results.length; i++) {
            text += event.results[i][0].transcript;
          }
          setTranscript(text);
        };

        recognition.onerror = () => {
          // Không có STT ⇒ vẫn ghi âm được, chỉ thiếu transcript.
        };

        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch {
      setError("Không mở được microphone — kiểm tra quyền truy cập");
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    recognitionRef.current?.stop();
    recognitionRef.current = null;

    setRecording(false);
  }

  async function submit() {
    if (transcript.trim().length === 0 || busy) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: transcript,
          lang: prompt?.lang ?? "en",
          mode: "speak",
          prompt: prompt?.prompt,
          allowLocalFallback: true,
        }),
      });

      const payload = await res.json();
      if (!payload.ok) {
        setError(payload.message ?? "Không chấm được");
        return;
      }

      setGrade(payload.data);

      // Lưu lượt luyện (AC-CM-5 — tạo Evidence).
      await fetch("/api/speak/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId,
          text: transcript,
          lang: prompt?.lang ?? "en",
          mode: "speak",
          score: payload.data.score,
          rubric: payload.data.rubric,
          feedback: payload.data.feedback,
        }),
      });

      router.refresh();
    } catch {
      setError("Không kết nối được");
    } finally {
      setBusy(false);
    }
  }

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  return (
    <div className="space-y-gutter-md">
      <header className="space-y-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          Luyện nói
        </h1>
        <p className="text-body-md text-body-md text-on-surface-variant">
          {prompts.length} đề · ghi âm + chấm theo 5 tiêu chí
        </p>
      </header>

      {/* Chọn đề */}
      <div>
        <label
          htmlFor="talk-prompt"
          className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
        >
          Đề bài
        </label>
        <select
          id="talk-prompt"
          value={promptId ?? ""}
          onChange={(event) => {
            setPromptId(event.target.value || null);
            setTranscript("");
            setGrade(null);
          }}
          className="mt-space-xs w-full rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <option value="">— Tự do —</option>
          {prompts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
              {item.level ? ` (${item.level})` : ""}
            </option>
          ))}
        </select>
      </div>

      {prompt && (
        <div className="rounded-xl bg-surface-container p-space-lg">
          <p className="font-body-md text-body-md text-on-surface">
            {prompt.prompt}
          </p>
        </div>
      )}

      {/* Ghi âm */}
      <div className="rounded-xl bg-surface-container-low p-space-lg">
        <button
          type="button"
          onClick={() => (recording ? stopRecording() : void startRecording())}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 font-label-md text-label-md font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            recording
              ? "bg-error-container text-on-error-container"
              : "bg-primary-container text-on-primary",
          )}
        >
          <Icon name={recording ? "stop" : "mic"} size={18} />
          {recording ? "Dừng ghi" : "Bắt đầu ghi"}
        </button>

        {recording && (
          <span
            role="timer"
            aria-live="polite"
            className="ml-space-sm font-code-md text-code-md text-error tabular"
          >
            ● {minutes}:{String(seconds).padStart(2, "0")}
          </span>
        )}

        {/* Transcript STT */}
        <div className="mt-space-md">
          <label
            htmlFor="talk-transcript"
            className="font-label-sm text-label-sm uppercase tracking-wider text-outline"
          >
            Lời nói (chuyển tự động qua STT)
          </label>
          <textarea
            id="talk-transcript"
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            placeholder="Ghi âm rồi nói — lời nói sẽ hiện ở đây. Cũng có thể gõ tay."
            rows={8}
            className="mt-space-xs w-full resize-y rounded-xl bg-surface-container-low p-space-md text-body-md text-body-md text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || transcript.trim().length === 0 || !aiEnabled}
          className="mt-space-sm inline-flex items-center gap-1 rounded-lg bg-secondary-container px-4 py-2 font-label-md text-label-md text-secondary transition hover:brightness-105 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Icon name="check" size={16} />
          {busy ? "Đang chấm…" : "Chấm bài nói"}
        </button>

        {!aiEnabled && (
          <p className="mt-space-sm inline-flex items-center gap-1 font-label-sm text-label-sm text-outline">
            <Icon name="lock" size={12} />
            Chưa có API key — chấm bằng rule cục bộ, không phải AI
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="font-label-sm text-label-sm text-error">
          {error}
        </p>
      )}

      {/* Kết quả */}
      {grade && (
        <section className="rounded-xl bg-surface-container p-space-lg" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-space-sm">
            <h2 className="font-headline-md text-headline-md text-on-surface">
              Điểm bài nói
            </h2>
            <div className="flex items-baseline gap-space-sm">
              <span className="font-headline-lg text-headline-lg text-primary tabular">
                {grade.score}
              </span>
              <span className="font-label-sm text-label-sm text-outline">/ 5</span>
              <span className="rounded-full bg-outline/15 px-2 py-0.5 font-label-sm text-label-sm text-outline">
                {grade.source === "ai" ? "AI" : "Rule cục bộ"}
              </span>
            </div>
          </div>

          <ul className="mt-space-md space-y-space-xs">
            {Object.entries(grade.rubric).map(([key, value]) => (
              <li key={key} className="flex items-center gap-space-sm">
                <span className="w-24 shrink-0 font-body-sm text-body-sm text-on-surface-variant">
                  {key}
                </span>
                <span
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-highest"
                  aria-hidden="true"
                >
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${(Number(value) / 5) * 100}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right font-code-md text-code-md text-on-surface tabular">
                  {Number(value).toFixed(1)}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-space-md text-body-md text-body-md text-on-surface">
            {grade.feedback}
          </p>
        </section>
      )}
    </div>
  );
}
