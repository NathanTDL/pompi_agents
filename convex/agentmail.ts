/**
 * AgentMail: each agent's own email inbox. The inbox's id is its address
 * (name@agentmail.to). Mail that comes in reaches us on a webhook (email.ts),
 * signed with Svix; agents' emails go out only after the team OKs them.
 */

const BASE = "https://api.agentmail.to/v0";

export const hasAgentMail = () => !!process.env.AGENTMAIL_API_KEY;

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.AGENTMAIL_API_KEY}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 200);
    try {
      const j = JSON.parse(text) as { message?: string; errors?: { message?: string }[] };
      message = [j.message, ...(j.errors ?? []).map((x) => x.message)].filter(Boolean).join(": ") || message;
    } catch {}
    throw new Error(`AgentMail ${res.status}: ${message}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export const agentmail = {
  /** A new inbox; `clientId` makes retries return the same one. */
  createInbox: (username: string, displayName: string, clientId: string) => call<{ inbox_id: string; email: string }>("POST", "/inboxes", { username, display_name: displayName, client_id: clientId }),
  deleteInbox: (inbox: string) => call<unknown>("DELETE", `/inboxes/${encodeURIComponent(inbox)}`),
  send: (inbox: string, o: { to: string[]; subject: string; text: string }) => call<{ message_id: string }>("POST", `/inboxes/${encodeURIComponent(inbox)}/messages/send`, o),
  reply: (inbox: string, messageId: string, text: string) => call<{ message_id: string }>("POST", `/inboxes/${encodeURIComponent(inbox)}/messages/${encodeURIComponent(messageId)}/reply`, { text }),
  createWebhook: (url: string) => call<{ webhook_id: string; secret: string }>("POST", "/webhooks", { url, event_types: ["message.received"], client_id: "pompi-incoming" }),
};

/**
 * Checks a webhook's Svix signature: HMAC-SHA256 over "id.timestamp.body" with
 * the secret ("whsec_" + base64 key), sent as "v1,<base64>" (several, space-separated).
 */
export async function verifySvix(secret: string, headers: Headers, body: string): Promise<boolean> {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigs = headers.get("svix-signature");
  if (!id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 5 * 60) return false;
  const raw = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  const expected = btoa(String.fromCharCode(...mac));
  return sigs.split(" ").some((s) => s.split(",")[1] === expected);
}

/** "Ada Lovelace <ada@x.com>" → { name: "Ada Lovelace", address: "ada@x.com" }. */
export function parseAddress(from: string): { name: string; address: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  const address = (m ? m[2] : from).trim();
  return { name: (m?.[1] ?? "").trim() || address, address };
}
