import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";

/**
 * Talking to the board: what someone said, as text (OpenAI's speech to text).
 * The canvas puts it on the board, where the right agent picks it up like
 * anything written there.
 */

const MODEL = () => process.env.POMPI_TRANSCRIBE_MODEL || "gpt-4o-transcribe";
const FALLBACK = "gpt-transcribe";
/** About two minutes of speech. */
const MAX_BYTES = 4 * 1024 * 1024;

export const transcribe = action({
  args: { boardId: v.id("boards"), audio: v.bytes(), mime: v.string() },
  handler: async (ctx, { boardId, audio, mime }): Promise<string> => {
    // Runs as the caller: only the board's members.
    const board = await ctx.runQuery(api.boards.get, { boardId });
    if (!board) throw new ConvexError("You're not on this board");
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new ConvexError("This Pompi has no OpenAI key, so it can't hear you yet");
    if (audio.byteLength > MAX_BYTES) throw new ConvexError("That was too long. Keep it under two minutes.");
    if (audio.byteLength < 1200) return "";

    const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "webm";
    const send = async (model: string) => {
      const form = new FormData();
      form.append("file", new Blob([audio], { type: mime || "audio/webm" }), `speech.${ext}`);
      form.append("model", model);
      form.append("response_format", "json");
      // Names and words people write on boards.
      form.append("prompt", `Someone talking to their AI teammates on a whiteboard called "${board.name}".`);
      return fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(60_000) });
    };
    let res = await send(MODEL());
    if (!res.ok && (res.status === 400 || res.status === 404) && MODEL() !== FALLBACK) res = await send(FALLBACK);
    if (!res.ok) {
      console.error("[voice] transcription failed", res.status, (await res.text()).slice(0, 300));
      throw new ConvexError("Couldn't make out what you said. Try again?");
    }
    const { text } = (await res.json()) as { text?: string };
    return (text ?? "").trim();
  },
});
