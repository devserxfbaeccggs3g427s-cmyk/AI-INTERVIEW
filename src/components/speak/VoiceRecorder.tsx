"use client";

/**
 * VoiceRecorder — Component ghi âm cho S08 (Luyện giao tiếp Nói).
 *
 * Chức năng:
 * - Record/Stop audio sử dụng MediaRecorder API
 * - Phát lại audio đã ghi
 * - Timer hiển thị thời gian ghi âm
 * - Waveform visualization (canvas)
 * - Trả về Blob audio để gửi lên server
 *
 * Xem tasks.md 18.1 · SPEC.md S08.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface VoiceRecorderProps {
  onRecordingComplete?: (blob: Blob, durationMs: number) => void;
  maxDurationMs?: number; // mặc định 5 phút
  language?: "vi" | "en" | "zh";
}

const MAX_DURATION_MS = 5 * 60 * 1000; // 5 phút

export function VoiceRecorder({
  onRecordingComplete,
  maxDurationMs = MAX_DURATION_MS,
  language = "vi",
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Cleanup audio URL
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const barWidth = Math.max(1, width / waveformData.length);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "var(--color-primary)";

    waveformData.forEach((value, i) => {
      const barHeight = Math.max(2, (value / 255) * height * 0.8);
      const x = i * barWidth;
      const y = (height - barHeight) / 2;
      ctx.fillRect(x, y, barWidth - 1, barHeight);
    });
  }, [waveformData]);

  // Real-time waveform during recording
  const updateWaveform = useCallback(() => {
    if (!analyserRef.current || !isRecording) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Convert to waveform-like data (average of frequency bins)
    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    setWaveformData((prev) => {
      const next = [...prev, avg];
      return next.slice(-100); // Keep last 100 frames
    });

    animationRef.current = requestAnimationFrame(updateWaveform);
  }, [isRecording]);

  // Start recording
  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });

      streamRef.current = stream;

      // Setup audio context for waveform
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // Setup MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setDurationMs(Date.now() - (timerRef.current as number));
        onRecordingComplete?.(blob, Date.now() - (timerRef.current as number));
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      timerRef.current = Date.now();

      // Start timer
      const tick = () => {
        if (!isRecording) return;
        setDurationMs(Date.now() - (timerRef.current as number));
        if (Date.now() - (timerRef.current as number) >= maxDurationMs) {
          stopRecording();
        } else {
          requestAnimationFrame(tick);
        }
      };
      tick();

      // Start waveform animation
      updateWaveform();
    } catch (e) {
      console.error("Recording error:", e);
      setError("Không thể truy cập micro. Vui lòng kiểm tra quyền truy cập.");
    }
  }, [maxDurationMs, onRecordingComplete, updateWaveform]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setIsRecording(false);
  }, [isRecording]);

  // Play recorded audio
  const playAudio = useCallback(() => {
    if (!audioUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
      audioRef.current.onerror = () => setError("Không thể phát audio");
    }

    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => setError("Không thể phát audio"));
    setIsPlaying(true);
  }, [audioUrl]);

  // Pause audio
  const pauseAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  // Reset recording
  const resetRecording = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setDurationMs(0);
    setWaveformData([]);
    setError(null);
  }, [audioUrl]);

  // Format duration as MM:SS
  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  // Language labels for Web Speech API
  const langLabels: Record<"vi" | "en" | "zh", string> = {
    vi: "vi-VN",
    en: "en-US",
    zh: "zh-CN",
  };

  return (
    <div className="space-y-gutter-md">
      {/* Recording Controls */}
      <div className="flex flex-col items-center gap-gutter-md">
        {/* Timer & Waveform */}
        <div className="w-full max-w-xl">
          <div className="flex items-center justify-between mb-gutter-sm">
            <div className="text-display-sm font-mono tabular-nums text-primary">
              {formatDuration(durationMs)}
            </div>
            {isRecording && (
              <span className="flex items-center gap-1.5 text-label-sm text-error animate-pulse">
                <span className="w-2 h-2 rounded-full bg-error"></span>
                Đang ghi
              </span>
            )}
          </div>

          {/* Waveform Canvas */}
          <canvas
            ref={canvasRef}
            className="w-full h-20 rounded-lg bg-surface-container-low border border-outline-variant/40"
            width={600}
            height={80}
          />

          {/* Progress bar during recording */}
          {isRecording && (
            <div className="mt-gutter-xs h-1 rounded-full bg-surface-container-high overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-100"
                style={{ width: `${Math.min((durationMs / maxDurationMs) * 100, 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Control Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-space-md">
          {!audioBlob ? (
            // Initial state - only record button
            <Button
              variant="danger"
              size="lg"
              className={cn("h-16 w-16 rounded-full", isRecording && "animate-pulse")}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isPlaying}
              aria-label={isRecording ? "Dừng ghi âm" : "Bắt đầu ghi âm"}
            >
              {isRecording ? (
                <span className="material-symbols-rounded text-3xl">stop</span>
              ) : (
                <span className="material-symbols-rounded text-3xl">mic</span>
              )}
            </Button>
          ) : (
            // Has recording - show play/pause, redo, confirm
            <div className="flex items-center gap-space-md">
              <Button
                variant={isPlaying ? "secondary" : "primary"}
                size="lg"
                className="h-16 w-16 rounded-full"
                onClick={isPlaying ? pauseAudio : playAudio}
                disabled={isRecording}
                aria-label={isPlaying ? "Tạm dừng" : "Phát lại"}
              >
                <span className="material-symbols-rounded text-3xl">
                  {isPlaying ? "pause" : "play_arrow"}
                </span>
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="h-16 w-16 rounded-full"
                onClick={resetRecording}
                disabled={isRecording || isPlaying}
                aria-label="Ghi lại"
              >
                <span className="material-symbols-rounded text-3xl">refresh</span>
              </Button>
              <Button
                variant="ai"
                size="lg"
                className="h-16 w-16 rounded-full"
                onClick={() => onRecordingComplete?.(audioBlob!, durationMs)}
                disabled={isRecording || isPlaying}
                aria-label="Xác nhận và chấm"
              >
                <span className="material-symbols-rounded text-3xl">psychology</span>
              </Button>
            </div>
          )}
        </div>

        {/* Language selector for STT hint */}
        <div className="flex items-center gap-space-sm text-body-sm text-on-surface-variant">
          <span className="material-symbols-rounded">translate</span>
          <span>Ngôn ngữ nhận diện: {language.toUpperCase()}</span>
          <span className="text-outline">({langLabels[language]})</span>
        </div>

        {error && (
          <p className="text-body-sm text-error text-center max-w-md">{error}</p>
        )}
      </div>

      {/* Recording Tips */}
      <details className="group">
        <summary className="cursor-pointer flex items-center gap-space-sm text-body-sm text-on-surface-variant">
          <span className="material-symbols-rounded text-lg">info</span>
          Mẹo ghi âm
        </summary>
        <div className="mt-gutter-sm space-y-1 text-body-sm text-on-surface-variant pl-8">
          <p>• Nói rõ ràng, tốc độ tự nhiên, cách micro ~15cm</p>
          <p>• Ghi âm ở nơi yên tĩnh, tắt thông báo thiết bị</p>
          <p>• Tối đa {Math.floor(maxDurationMs / 60000)} phút / lần ghi</p>
          <p>• Nhấn "Ghi lại" nếu muốn làm lại</p>
        </div>
      </details>
    </div>
  );
}

/**
 * Hook để dùng Web Speech API cho Speech-to-Text (STT)
 * Dùng riêng cho việc transcribe real-time trong khi nói
 * Xem tasks.md 18.2
 */
export function useSpeechRecognition(
  language: "vi" | "en" | "zh" = "vi",
  onResult?: (transcript: string, isFinal: boolean) => void
) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const langMap: Record<"vi" | "en" | "zh", string> = {
    vi: "vi-VN",
    en: "en-US",
    zh: "zh-CN",
  };

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Trình duyệt không hỗ trợ Web Speech API");
      return;
    }

    const recognition: SpeechRecognition = new SpeechRecognition() as SpeechRecognition;
    recognition.lang = langMap[language];
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      const fullTranscript = finalTranscript + interimTranscript;
      setTranscript(fullTranscript);
      onResult?.(fullTranscript, !!finalTranscript);
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(`Lỗi nhận diện: ${event.error}`);
      }
    };

    recognition.onend = () => {
      if (isListening) {
        // Auto-restart if still supposed to be listening
        try {
          recognition.start();
        } catch {
          setIsListening(false);
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [language, isListening, onResult]);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      setError(null);
      setTranscript("");
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        setError("Không thể bắt đầu nhận diện giọng nói");
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  return { isListening, transcript, error, startListening, stopListening };
}

// Type declaration for Web Speech API
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}