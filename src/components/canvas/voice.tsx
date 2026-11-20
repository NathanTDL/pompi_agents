"use client";

import * as React from "react";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { LoaderCircle, Mic, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export type VoiceState = "idle" | "listening" | "thinking";

/** The longest one go at talking, then it stops by itself. */
const MAX_MS = 120_000;

/**
 * Talking to the board: records from the mic, then turns it into text
 * (convex/voice.ts) and hands it to `onText`. `start` / `stop` / `cancel`.
 */
export function useVoice(boardId: Id<"boards">, onText: (text: string) => void) {
  const transcribe = useAction(api.voice.transcribe);
  const [state, setState] = React.useState<VoiceState>("idle");
  const [level, setLevel] = React.useState(0);
  const [startedAt, setStartedAt] = React.useState(0);
  const rec = React.useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; cancelled: boolean; stopLevel: () => void; timer: number } | null>(null);
  const onTextRef = React.useRef(onText);
  React.useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  const finish = React.useCallback(
    async (blob: Blob) => {
      setState("thinking");
      try {
        const text = await transcribe({ boardId, audio: await blob.arrayBuffer(), mime: blob.type });
        if (text) onTextRef.current(text);
        else toast("Didn't catch anything", { description: "Hold M (or the mic) and talk, then let go." });
      } catch (e) {
        toast.error(e instanceof ConvexError ? String(e.data) : "Couldn't make out what you said");
      } finally {
        setState("idle");
      }
    },
    [transcribe, boardId],
  );

  const start = React.useCallback(async () => {
    if (rec.current || state !== "idle") return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast.error("Pompi can't hear you", { description: "Allow the microphone for this site, then try again." });
      return;
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    // How loud, for the meter.
    const audio = new AudioContext();
    const analyser = audio.createAnalyser();
    analyser.fftSize = 512;
    audio.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const b of buf) sum += ((b - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
      raf = requestAnimationFrame(tick);
    };
    tick();

    const r = {
      recorder,
      stream,
      chunks,
      cancelled: false,
      stopLevel: () => {
        cancelAnimationFrame(raf);
        void audio.close();
      },
      timer: window.setTimeout(() => recorder.state === "recording" && recorder.stop(), MAX_MS),
    };
    recorder.onstop = () => {
      window.clearTimeout(r.timer);
      r.stopLevel();
      stream.getTracks().forEach((t) => t.stop());
      rec.current = null;
      setLevel(0);
      if (r.cancelled) {
        setState("idle");
        return;
      }
      void finish(new Blob(chunks, { type: recorder.mimeType || mime || "audio/webm" }));
    };
    rec.current = r;
    recorder.start(250);
    setStartedAt(Date.now());
    setState("listening");
  }, [state, finish]);

  const stop = React.useCallback(() => {
    const r = rec.current;
    if (r && r.recorder.state === "recording") r.recorder.stop();
  }, []);

  const cancel = React.useCallback(() => {
    const r = rec.current;
    if (!r) return;
    r.cancelled = true;
    if (r.recorder.state === "recording") r.recorder.stop();
  }, []);

  // Let go of the mic when the board closes.
  React.useEffect(() => () => {
    const r = rec.current;
    if (r) {
      r.cancelled = true;
      if (r.recorder.state === "recording") r.recorder.stop();
    }
  }, []);

  return { state, level, startedAt, start, stop, cancel };
}

/** While someone's talking: what's happening, how loud, and how to stop. */
export function VoicePill({ state, level, startedAt, onStop, onCancel }: { state: VoiceState; level: number; startedAt: number; onStop: () => void; onCancel: () => void }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (state !== "listening") return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [state]);
  if (state === "idle") return null;
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000));
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div data-ui className="pointer-events-auto absolute bottom-[92px] left-1/2 z-40 flex -translate-x-1/2 animate-pop items-center gap-3 rounded-full bg-[#16151A] py-2 pr-2 pl-3 text-white shadow-[0_18px_40px_-14px_rgba(22,21,26,0.8)]" onPointerDown={stop} onDoubleClick={stop}>
      {state === "listening" ? (
        <>
          <span className="relative flex size-8 items-center justify-center rounded-full bg-[#F24822]">
            <span className="absolute inset-0 animate-ping rounded-full bg-[#F24822]/50" />
            <Mic className="relative size-4" />
          </span>
          <span className="flex h-6 items-center gap-[3px]" aria-hidden>
            {[0.5, 0.8, 1, 0.75, 0.55].map((f, i) => (
              <span key={i} className="w-[3px] rounded-full bg-white/85 transition-[height] duration-75" style={{ height: `${Math.max(4, Math.round(24 * Math.min(1, level * f * 1.6)))}px` }} />
            ))}
          </span>
          <span className="min-w-[96px] text-[13px] font-medium">
            Listening… <span className="font-mono text-white/55 tabular-nums">{`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`}</span>
          </span>
          <button type="button" onClick={onStop} className="h-8 rounded-full bg-white px-3.5 text-[12.5px] font-semibold text-[#16151A] hover:bg-white/90">
            Done
          </button>
          <button type="button" onClick={onCancel} aria-label="Cancel" title="Cancel (Esc)" className="flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
            <X className="size-4" />
          </button>
        </>
      ) : (
        <span className="flex items-center gap-2.5 py-1 pr-3 text-[13px] font-medium">
          <LoaderCircle className="size-4 animate-spin text-white/70" /> Writing down what you said…
        </span>
      )}
    </div>
  );
}
