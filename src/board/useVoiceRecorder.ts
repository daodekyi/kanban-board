import { useCallback, useEffect, useRef, useState } from "react";

/** Lệnh Kanban là câu ngắn; tự dừng để không lỡ tay ghi âm mãi. */
export const MAX_RECORDING_SECONDS = 60;

export type RecorderState = "idle" | "recording" | "unsupported";

/** Chrome/Firefox ghi webm/opus, Safari chỉ ghi mp4 — cả hai OpenAI đều nhận. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
}

/**
 * Ghi âm bằng MediaRecorder: bấm một lần để bắt đầu, bấm lần nữa để dừng (dễ
 * dùng trên điện thoại hơn kiểu giữ nút). Dừng xong gọi `onRecorded` với Blob.
 */
export function useVoiceRecorder(onRecorded: (audio: Blob) => void, onError: (message: string) => void) {
  const supported =
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
  const [state, setState] = useState<RecorderState>(supported ? "idle" : "unsupported");
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const callbacksRef = useRef({ onRecorded, onError });
  callbacksRef.current = { onRecorded, onError };

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const start = useCallback(async () => {
    if (!supported || recorderRef.current) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      callbacksRef.current.onError(
        "Chưa dùng được micro. Bạn cho phép trình duyệt truy cập micro (biểu tượng ổ khóa cạnh địa chỉ trang) rồi thử lại."
      );
      return;
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      // Tắt micro ngay — để luồng mở thì trình duyệt vẫn hiện chấm đỏ "đang ghi".
      stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
      setState("idle");
      const audio = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      if (audio.size > 0) callbacksRef.current.onRecorded(audio);
    };
    recorderRef.current = recorder;
    recorder.start();
    setSeconds(0);
    setState("recording");
  }, [supported]);

  useEffect(() => {
    if (state !== "recording") return;
    const t = window.setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_RECORDING_SECONDS) stop();
        return s + 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [state, stop]);

  // Đóng panel/rời trang giữa chừng: tắt micro, bỏ đoạn đang ghi.
  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = () => recorder.stream.getTracks().forEach((t) => t.stop());
        recorder.stop();
      }
    },
    []
  );

  return { state, seconds, start, stop };
}
