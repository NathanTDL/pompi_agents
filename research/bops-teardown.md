# Bops teardown (for Pompi)

Researched 2026-11-19 from https://bops.bot and https://github.com/OrgoAI/bops (source read directly:
`lib/server/chat.ts`, `routing.ts`, `decide.ts`, `judgment.ts`, `permission.ts`, `computer-task.ts`,
`screens.ts`, `presence.ts`, `orgo.ts`, `orgo/bops-base.mjs`).

> **License warning:** Bops is FSL-1.1-ALv2. You may read, self-host and modify it, but **not** use it to offer a
> competing hosted product (each version becomes Apache 2.0 two years after release). Pompi competes, so treat this
> as a reference for ideas and patterns. Don't copy code.

## 1. What Bops is

- A Mac app (Electron, `desktop/`) that starts a local Next.js server on port 3210. You get a team of named bots
  (Boppy the chief of staff, Penny for finance, Otto for outbound, Iris for the inbox), and each one has a role, an
  email address, an optional phone number and memory.
- The UI is chat, like iMessage: one chat per bot plus group chats. Threads hold the long tasks, and a "Needs you"
  queue holds approvals.
- Reachable from the app, Slack, Telegram, Discord, SMS, phone calls and email.
- Bops Cloud (`cloud/`, Postgres in `db/`) holds provider keys, receives webhooks and syncs state. Self-hosted mode
  (`BOPS_SELF_HOSTED=1`) keeps state in `.data/`.
- Pricing: no subscription. The computer costs from $0.055/h while working and nothing while asleep, AI is billed at
  cost, and a phone number is $3/mo. The README lists Free, Pro ($20) and Max ($200) plans.

### Third-party services

| Job | Vendor |
|---|---|
| Cloud computers (VMs) | **Orgo** (`orgo.ai`), the same company |
| LLM, computer use, voice | OpenAI Responses API (`gpt-6.1-sol` default, `gpt-6-astra` for hard tasks, `gpt-6-luna` for light ones) |
| Cheap routing and judgment calls | **TypeSafe "Jev"** (`/v1/systemone`): typed answers with calibrated probabilities, about 200 ms |
| Memory | Honcho |
| App integrations (Gmail, CRM…) | Composio |
| Business data | treg |
| Email and phone identity | AgentMail, AgentPhone |

## 2. The computer: **one VM shared by many bots, with four screens** (the model Pompi wants)

This is the main finding. Bops already supports "unlimited bots share one computer":

- The Orgo template `bops-base` (`orgo/bops-base.mjs`) has 4 vCPU, 16 GB RAM, an 80 GB disk, `1280x960` (4:3)
  screens and `auto_stop_minutes: 0`. Installed on it: xdotool, scrot, Chrome per screen, Node 24, Codex CLI,
  Claude Code, a "screen MCP", Tailscale, and real apps (GIMP, Inkscape, LibreOffice).
- **Four X displays (`:1`–`:4`) per computer.** Each display runs its own Chrome with DevTools on port
  `9200 + display`.
- A bot either owns a computer or *shares* the main bot's (`workBot` / `workComputer`, and `sameComputer(a,b)` in
  `screens.ts`). On a shared computer, a screen used by any thread, helper, watch or a human taking over counts as
  taken for every bot on it. The prompt says: *"You work on X's cloud computer, sharing its four screens with your
  team, so a task of yours waits when they're all in use."*
- So **screen = unit of concurrency, computer = unit of cost and shared filesystem.** This maps straight onto
  "one computer per canvas": one VM per canvas, N displays, and each agent task claims a free display.

### The computer-use loop (`computer-task.ts`)

1. The OpenAI Responses API's built-in `{type:"computer"}` tool. The model sees a screenshot and returns a batch of
   actions (click, type, keypress, scroll, drag, wait).
2. Bops runs them with **xdotool through Orgo's bash endpoint** (`DISPLAY=:n xdotool …`), waits 0.6 s for the screen
   to settle, then takes a screenshot (`orgo.screenshot(computerId, screen-<n>)`) and sends it back as
   `computer_call_output`.
3. Alongside it run more tools: **`page_script`**, a short Playwright script run against that screen's Chrome over
   CDP. It reads and fills pages by their elements, which is much faster than working pixel by pixel. If a script
   fails twice or changes nothing, the bot is told to use the screen instead. Also: a shell (`orgo.bash`, cwd
   `/workspace`), web search, Composio app tools, data tools, a vault sign-in tool (the model never types
   passwords), and repo or file changes.
4. A turn is capped at 400 model calls. Their benchmark: this was about 30% faster and 45% cheaper than an Agents
   API + MCP harness at the same success rate.
5. Each action writes `/root/.bops/activity/<display>`, which is how the UI knows what the bot is doing on each
   screen.

### Watching and taking over

- Orgo provides VNC/WebRTC streams per screen. Bops also mirrors Chrome over CDP through the tailnet, and falls back
  to screenshots.
- "Take over" sends your mouse and keyboard over one WebSocket. Moves and scrolls get coalesced; clicks and keys are
  never dropped.

### Hosting ("is the website deployed?")

Orgo has deploy APIs on the computer itself: `deploy-projects` (create, deploy, env, logs, rollback),
`public-urls` (with passwords), and domains (search, buy, connect, verify). Bots deploy from their own VM, and the
"Your Apps" screen shows a preview vs. release diff before you publish. → In Pompi, a **live website frame on the
canvas** = an iframe of an Orgo public URL.

## 3. "The right agent responds" (`chat.ts` → `plan()` / `groupTurn()`)

No LLM picks the agent. **One Jev call** answers several typed questions at once:

- `need`: `words | tapback | nothing`. Does the message need an answer, just an emoji reaction, or nothing?
- For each candidate bot, a yes/no probability: *"Is `message` meant for {name} ({role}): addressed by name, to
  everyone, a reply to them, or a request that falls in their role?"*
- `reaction`: which tapback fits.

Rules on top:
- An `@mention`, or a reply to a bot's message, counts as **certain** (p = 1).
- Bots with p ≥ 0.5 answer, at most 3. If nobody clears the bar, the likeliest bot answers when its p ≥ 0.2, else the
  main bot (chief of staff).
- **Bot-to-bot:** after a bot speaks, `plan()` runs again on its message. Only bots the speaker is allowed to ask on
  the "team chart" are candidates. The bar rises with every hop, `min(0.9, 0.6 + 0.1·hop)`, so banter winds down on
  its own, usually ending in a tapback. The hard cap is 8 turns per user message, and a new user message stops the
  exchange.
- **`askTeammate` tool:** a bot can privately ask another bot a question in a pair chat. The answer is 1–3 sentences
  and is filtered so private things ("don't tell Sam") stay private. This is how agents work together without the
  user managing them.

The same Jev pattern is used for model routing (`routing.ts`): difficulty `quick/standard/deep/max` plus "costly
mistake?" goes up a tier. **Speed tier is based on presence**: if the user is looking at the thread right now, the
call runs at Ultrafast/Fast, otherwise at standard.

## 4. "Agents ask before risky actions" (`judgment.ts`, `permission.ts`)

- `lowRisk(action)` asks Jev three things: does it **reach** anyone else (<0.2)? Could it do **harm** or be hard to
  undo (<0.45)? Is it clearly **safe** (≥0.8)? Only when all three pass does the bot act without asking. If Jev
  can't answer, the bot asks.
- `movesMoney()` checks separately, so even a bot on "Just do it" asks before paying. The prompt warns Jev that the
  action details are the assistant's own input and may try to sway it.
- Flow: the tool throws `NeedsOk`, which creates an `AppApproval` record (action, resources, preview, reason). The
  turn **pauses** (`Paused`) and holds nothing: no screen, no process, and the VM can sleep. OpenAI's stored response
  waits for that tool call's output. The user picks once, always (a rule like Claude Code's "don't ask again"), or
  reject with a message. The run resumes from the stored response.
- → In Pompi, a raised hand on the canvas = a pending `AppApproval`. Answering it on the canvas resumes the run.

## 5. Other patterns worth copying

- **Presence-aware speed:** `presence.ts` gets the open chat or thread and window focus from the client every few
  seconds and treats it as stale after 20 s. Pompi equivalent: is the agent's frame inside someone's viewport?
- **Turn context (AsyncLocalStorage):** every write in a turn carries the turn id. The first irreversible act is
  marked (`noteActing`) so a crashed turn is never retried blindly.
- **Memory gate:** `needsMemory()` skips the memory search for small talk, which makes those turns faster.
- **Live feed:** bots' "moods" (typing, working, on a call) go out over a stream and are re-sent every 5 s.
- **Skills, routines, watches:** reusable procedures, scheduled tasks, and screen or inbox watchers.

## 6. Mapping to Pompi

| Pompi idea | Bops mechanism to adapt | Canvas-specific twist |
|---|---|---|
| One computer per canvas | Shared computer, N displays, a screen is "taken" while in use, tasks queue | One Orgo VM per board; show each display as a frame; queue badge when screens are full; shared `/workspace` makes handoffs free (Copywriter's file → Dev's site) |
| Write on canvas → right agent walks over | `plan()`: one cheap classifier call, per-agent probability, @mention certain, fallback lead agent | Add **spatial signals**: distance from the sticky to each agent's cursor, which frame it sits in, recent activity nearby. Then animate the winning cursor to the sticky |
| Agents work with each other | Bot-to-bot hops with a rising bar + `askTeammate` + team chart | Show the exchange as cursors meeting and connector lines between artifacts; cap hops |
| Raise hand before risky acts | `lowRisk` / `movesMoney` + `NeedsOk` → paused, resumable run | Hand icon on the agent's cursor plus a card with Allow / Always / Deny and a reason ("2 tests failing") |
| Work appears on canvas | Deploy APIs → public URL; files; drafts | Shapes: live iframe frame, editable post card, research note, file card |
| "Is it deployed?" | Orgo deploy-projects / public-urls state | Answer as a reply sticky next to the question |
| Voice | OpenAI realtime voice (Bops calls) | Push to talk → transcript sticky at the cursor |

### Open questions

1. **Base:** your existing `E:/cloudysky` (forked from 10xpompi: Next 16, tldraw 5, Convex, better-auth, eve agent,
   OpenRouter, voice) already has the canvas, auth and payments. Building Pompi on it (or on 10xpompi) is the obvious
   start.
2. **VM provider:** Orgo (what Bops uses: screens, clone/fork, deploy, public URLs, about $0.055/h) vs E2B desktop,
   Daytona, Modal, or your own Hetzner machines with Xvfb.
3. **Computer-use model:** the "Grok Bot" framing suggests xAI, but Bops' loop is built on OpenAI's native `computer`
   tool. Anthropic's computer use is the other mature option. OpenRouter alone won't give you a native computer-use
   tool.
4. **Router:** TypeSafe Jev (cheap, calibrated) vs a small, fast LLM returning per-agent JSON scores.
