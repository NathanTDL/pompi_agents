/**
 * The models, as Bops runs them: Sol for answers, Astra for hard work, Luna
 * for small fixed-shape jobs (the judge, when there's no TypeSafe key). Each
 * is a setting, so a self-hoster can swap them.
 */

export const SOL = () => process.env.POMPI_MODEL || "gpt-6.1-sol";
export const ASTRA = () => process.env.POMPI_HARD_MODEL || "gpt-6-astra";
export const LUNA = () => process.env.POMPI_LIGHT_MODEL || "gpt-6-luna";

export const hasOpenAI = () => !!process.env.OPENAI_API_KEY;

type Effort = "low" | "medium" | "high";

/** One Responses API call whose answer is JSON matching `schema`. */
export async function respondJson<T>(o: { model: string; effort?: Effort; instructions: string; input: string; name: string; schema: Record<string, unknown>; tools?: unknown[]; timeoutMs?: number }): Promise<T> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("No OPENAI_API_KEY on this deployment");
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: o.model,
      instructions: o.instructions,
      input: o.input,
      ...(o.effort ? { reasoning: { effort: o.effort } } : {}),
      ...(o.tools?.length ? { tools: o.tools } : {}),
      text: { format: { type: "json_schema", name: o.name, schema: o.schema, strict: true } },
      store: false,
    }),
    signal: AbortSignal.timeout(o.timeoutMs ?? 90_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { output?: { type: string; content?: { type: string; text?: string }[] }[] };
  const text = (body.output ?? [])
    .filter((x) => x.type === "message")
    .flatMap((x) => x.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");
  return JSON.parse(text) as T;
}

/* ---------------- the judge ---------------- */

export type Candidate = { id: string; name: string; role: string; instructions: string };
export type Pick = { agentId: string | null; why: string };

/**
 * Who on the team, if anyone, should take what was written. A name or
 * @mention at the start is certain; otherwise TypeSafe's Jev (calibrated, fast,
 * cheap) when there's a key, else one small OpenAI call.
 */
export async function judge(text: string, team: Candidate[], context: string): Promise<Pick> {
  if (!team.length) return { agentId: null, why: "No agents on the board" };
  // "@Juno …" anywhere, or "Juno, …" / "Juno: …" at the start.
  const named = team.find((a) => new RegExp(`@${escape(a.name)}\\b|^\\s*${escape(a.name)}\\s*[,:]`, "i").test(text));
  if (named) return { agentId: named.id, why: `Named ${named.name}` };
  if (process.env.TYPESAFE_API_KEY) {
    const viaJev = await jev(text, team, context).catch(() => null);
    if (viaJev) return viaJev;
  }
  return viaModel(text, team, context);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function jev(text: string, team: Candidate[], context: string): Promise<Pick | null> {
  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "jev-latest",
      state: { written: text, nearby_on_the_board: context.slice(0, 1500), agents: Object.fromEntries(team.map((a) => [a.id, `${a.name}, ${a.role}`])) },
      questions: {
        need: {
          type: "choice",
          instructions: "Someone wrote `written` on a shared whiteboard where AI agents work as teammates. Is it a question or request for the agents, or just a note, idea or label for the people on the board?",
          criteria: {
            agents: "A question or request for an agent to answer or do (e.g. 'is the site deployed?', 'craft launch post', 'summarise these')",
            note: "A brainstorm idea, a label, a heading, a note to people: nothing for an agent to do",
          },
        },
        ...Object.fromEntries(
          team.map((a) => [
            a.id,
            { type: "noul", instructions: `Is \`written\` meant for ${a.name} (${a.role}): addressed to ${a.name}, or a request that falls in a ${a.role}'s work?` },
          ]),
        ),
      },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const { answers } = (await res.json()) as { answers: Record<string, { type: string; choice?: string; noul?: number }> };
  if (answers.need?.choice === "note") return { agentId: null, why: "A note, not a request" };
  const ranked = team.map((a) => ({ a, p: answers[a.id]?.noul ?? 0 })).sort((x, y) => y.p - x.p);
  const top = ranked[0];
  if (!top || top.p < 0.2) return { agentId: null, why: "Nobody's role fits" };
  return { agentId: top.a.id, why: `${top.a.name} (${Math.round(top.p * 100)}%)` };
}

async function viaModel(text: string, team: Candidate[], context: string): Promise<Pick> {
  const ids = team.map((a) => a.id);
  const out = await respondJson<{ for_agents: boolean; agent: string; why: string }>({
    model: LUNA(),
    effort: "low",
    name: "route",
    timeoutMs: 20_000,
    instructions:
      "You route what people write on a shared whiteboard to their AI agent teammates. Decide if the text is a question or request for an agent (not a brainstorm idea, label, heading or note to people), and if so which agent's role fits it best. Be strict: short idea stickies like 'waitlist first' are notes, not requests.",
    input: JSON.stringify({
      written: text,
      nearby_on_the_board: context.slice(0, 1500),
      agents: team.map((a) => ({ id: a.id, name: a.name, role: a.role, does: a.instructions.slice(0, 200) })),
    }),
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["for_agents", "agent", "why"],
      properties: {
        for_agents: { type: "boolean" },
        agent: { type: "string", enum: [...ids, "none"] },
        why: { type: "string" },
      },
    },
  });
  if (!out.for_agents || out.agent === "none" || !ids.includes(out.agent)) return { agentId: null, why: out.why || "Not a request" };
  return { agentId: out.agent, why: out.why };
}
