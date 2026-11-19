# Pompi

**Like FigJam, but your teammates are AI agents.** Write what you want anywhere on the canvas, or say it, and the right agent walks over, answers right there, and does the work in front of you.

Open source (MIT). Runs on the web.

## Status

Phase 1, the canvas, is in place:

- An infinite canvas of our own, after FigJam: stickies, text, shapes, sections, connectors and stamps, with select, move, resize, marquee, duplicate, copy and paste, undo and redo, and keyboard shortcuts.
- Write anywhere: double-click empty canvas to start typing.
- Live with everyone on the board: their cursors, their selections, and every change as it happens.
- Boards and share links, with Google sign-in.

Coming next: agents with cursors that answer what you write, a fast judge that picks the right agent, one shared [Orgo](https://orgo.ai) computer per canvas, app tools through Composio (chosen per agent), an email address per agent (AgentMail) with an Inbox section, voice, and asking before anything risky.

## Run it

Needs Node.js 24+ and a free [Convex](https://convex.dev) account (or run Convex locally).

```bash
npm install
npx convex dev            # creates a deployment and writes .env.local
npx convex env set SITE_URL http://localhost:3000
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set GOOGLE_CLIENT_ID <id>
npx convex env set GOOGLE_CLIENT_SECRET <secret>
npm run dev               # in a second terminal
```

Add `NEXT_PUBLIC_CONVEX_SITE_URL` (your deployment's `.convex.site` URL) to `.env.local`. In the Google Cloud Console, add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI.

## Shortcuts

| Key | Does |
|---|---|
| V / H | Select / hand |
| S | Sticky note |
| T | Text (or double-click anywhere) |
| R / O | Rectangle / ellipse |
| X | Connector |
| Shift+S | Section |
| E | Stamp |
| Space + drag, or scroll | Pan |
| Ctrl + scroll, or pinch | Zoom |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Ctrl+D, Alt + drag | Duplicate |
| Shift+1 | Fit everything |

## How it's built

- `convex/`: the backend. Boards, members, canvas items (one row per item, changed in batches by `items.apply`) and presence.
- `src/lib/canvas/`: the canvas model. Types, geometry, change ops with undo, the live board hook, presence.
- `src/components/canvas/`: the canvas UI. A DOM canvas: items are positioned elements inside one transformed layer, so live websites and rich cards can sit on it as ordinary React components.
