/**
 * X (Twitter) links an agent is asked about, read for it: X blocks web search,
 * so posts (and the articles they link) come from FxTwitter's public API instead.
 */

const POST = /https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(\w{1,15})\/status\/(\d{5,25})/gi;
const MAX_LINKS = 3;
const MAX_CHARS = 14_000;

type Block = { text?: string; type?: string };
type Tweet = {
  url?: string;
  text?: string;
  created_at?: string;
  likes?: number;
  retweets?: number;
  views?: number;
  author?: { name?: string; screen_name?: string };
  quote?: Tweet;
  article?: { title?: string; content?: { blocks?: Block[] } };
};

function describe(t: Tweet): string {
  const who = t.author ? `${t.author.name ?? ""} (@${t.author.screen_name ?? ""})` : "Someone";
  const lines = [`${who}${t.created_at ? `, ${t.created_at}` : ""}: ${t.text ?? ""}`];
  if (t.likes !== undefined) lines.push(`(${t.likes} likes, ${t.retweets ?? 0} reposts${t.views ? `, ${t.views} views` : ""})`);
  if (t.article) {
    const body = (t.article.content?.blocks ?? [])
      .map((b) => (b.type?.startsWith("header") ? `\n## ${b.text ?? ""}` : b.text ?? ""))
      .filter((s) => s.trim())
      .join("\n");
    lines.push(`The article it links, "${(t.article.title ?? "").trim()}":\n${body}`);
  }
  if (t.quote) lines.push(`Quoting: ${describe(t.quote)}`);
  return lines.join("\n");
}

/** The X posts linked in `text`, as plain text (empty when there are none, or none could be read). */
export async function readLinks(text: string): Promise<string> {
  const ids = [...new Set([...text.matchAll(POST)].map((m) => m[2]))].slice(0, MAX_LINKS);
  if (!ids.length) return "";
  const read = await Promise.all(
    ids.map(async (id) => {
      try {
        const res = await fetch(`https://api.fxtwitter.com/status/${id}`, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "Pompi" } });
        if (!res.ok) return `Post ${id}: couldn't be read (${res.status}).`;
        const { tweet } = (await res.json()) as { tweet?: Tweet };
        return tweet ? `${tweet.url ?? id}\n${describe(tweet)}` : `Post ${id}: couldn't be read.`;
      } catch (e) {
        return `Post ${id}: couldn't be read (${(e as Error).message.slice(0, 60)}).`;
      }
    }),
  );
  return read.join("\n\n---\n\n").slice(0, MAX_CHARS);
}
