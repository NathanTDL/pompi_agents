import Link from "next/link";
import { Caveat } from "next/font/google";
import { ArrowRight, Brain, Check, ChevronDown, Globe, KeyRound, Mail, Plus, Repeat, ShieldCheck, Sparkles, SquareTerminal, X } from "lucide-react";
import { Logo, LogoMark, GithubMark } from "@/components/brand/logo";
import { Pom } from "@/components/canvas/pom";
import { HeroDemo } from "@/components/landing/hero-demo";
import { Jobs } from "@/components/landing/jobs";
import { RotatingWord } from "@/components/landing/rotating-word";
import { features, PAID_PLANS, PLANS, TRIAL_OPEN } from "@/convex/plans";

const GITHUB = "https://github.com/NathanTDL/pompi_agents";

/** For the hand-written notes on the page. */
const hand = Caveat({ subsets: ["latin"], weight: ["600"] });

export default function Home() {
  return (
    <div className="pompi-grain min-h-dvh overflow-x-hidden bg-[#FAF9F6] text-ink">
      <Nav />
      <Hero />
      <Steps />
      <Jobs />
      <Features />
      <Rules />
      <Compare />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ---------------- shared bits ---------------- */

/** The page's one main action, used all the way down. */
function StartButton({ big, light }: { big?: boolean; light?: boolean }) {
  return (
    <Link
      href="/app"
      className={`group inline-flex items-center gap-2 rounded-full font-semibold transition-all hover:-translate-y-0.5 ${big ? "h-14 px-7 text-[16px]" : "h-12 px-6 text-[15px]"} ${
        light ? "bg-white text-ink hover:bg-white/90" : "bg-ink text-white shadow-[0_14px_30px_-14px_rgba(22,21,26,0.8)] hover:bg-black"
      }`}
    >
      {TRIAL_OPEN ? "Start free" : "Get started"} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Small print under a main button: what people worry about before they click. */
function Reassure({ light }: { light?: boolean }) {
  return <p className={`mt-3 text-[13px] ${light ? "text-white/55" : "text-muted"}`}>{TRIAL_OPEN ? "3 days free, no card · Then from $19 a month" : "From $19 a month · Cancel any time"} · Works in your browser</p>;
}

/** A section's label: mono caps, like a tag on a board. */
function Tag({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "sticky" }) {
  return (
    <p className={`inline-flex items-center font-mono text-[12px] font-semibold tracking-[0.14em] uppercase ${tone === "sticky" ? "rounded-md bg-[#FFE48C] px-2.5 py-1 text-ink" : "text-muted"}`}>
      {children}
    </p>
  );
}

function H2({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1] font-bold tracking-[-0.045em] text-balance ${className}`}>{children}</h2>;
}

/* ---------------- nav ---------------- */

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-black/[0.05] bg-[#FAF9F6]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-8 text-[14px] font-medium text-ink-2 md:flex">
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href="#features" className="hover:text-ink">Features</a>
          <a href="#models" className="hover:text-ink">Models</a>
          <a href="#pricing" className="hover:text-ink">Pricing</a>
          <a href="#faq" className="hover:text-ink">FAQ</a>
        </nav>
        <div className="flex items-center gap-1.5">
          <a href={GITHUB} aria-label="Pompi on GitHub" className="hidden size-9 items-center justify-center rounded-full text-ink-2 hover:bg-black/[0.05] sm:flex">
            <GithubMark className="size-[18px]" />
          </a>
          <Link href="/login" className="hidden h-9 items-center rounded-full px-3.5 text-[14px] font-medium text-ink-2 hover:bg-black/[0.05] sm:flex">
            Sign in
          </Link>
          <Link href="/app" className="flex h-9 items-center rounded-full bg-ink px-4 text-[14px] font-semibold text-white hover:bg-black">
            {TRIAL_OPEN ? "Start free" : "Get started"}
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ---------------- hero ---------------- */

function Hero() {
  return (
    <section className="relative">
      <div className="mx-auto max-w-6xl px-5 pt-16 sm:px-8 sm:pt-24">
        <div className="animate-fade-up">
          <Tag tone="sticky">
            <span>
              Like <RotatingWord />, but your teammates are AI
            </span>
          </Tag>
        </div>
        <h1 className="mt-7 max-w-4xl animate-fade-up text-[clamp(2.9rem,7.6vw,6rem)] leading-[0.95] font-bold tracking-[-0.055em] [animation-delay:80ms]">
          Write it on the board.
          <br />
          <span className="text-black/35">Your AI team does it.</span>
        </h1>
        <div className="mt-8 grid animate-fade-up items-end gap-8 [animation-delay:160ms] lg:grid-cols-[1fr_auto]">
          <p className="max-w-xl text-[clamp(1.05rem,1.5vw,1.2rem)] leading-relaxed text-pretty text-ink-2">
            Pompi is a shared whiteboard where AI agents work next to you. Write a task anywhere, or just say it. The right agent walks over, answers right there, and does the work where everyone can see it.
          </p>
          <div className="lg:text-right">
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <StartButton big />
              <a href={GITHUB} className="inline-flex h-14 items-center gap-2 rounded-full px-5 text-[15px] font-semibold text-ink hover:bg-black/[0.05]">
                <GithubMark className="size-[18px]" /> Star on GitHub
              </a>
            </div>
            <Reassure />
          </div>
        </div>
      </div>

      <div className="relative mx-auto mt-14 max-w-6xl animate-fade-up px-3 [animation-delay:260ms] sm:mt-16 sm:px-8">
        <p className={`${hand.className} absolute -top-9 right-6 hidden rotate-[-4deg] items-center gap-2 text-[22px] text-[#7B4DFF] sm:right-12 sm:flex`}>
          watch it work
          <svg width="34" height="26" viewBox="0 0 34 26" fill="none" className="mt-3">
            <path d="M2 3c9 2 19 8 27 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M22 21l7 2 1-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </p>
        <div className="pompi-window overflow-hidden rounded-[20px] bg-white">
          <AppChrome />
          <HeroDemo />
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-[14px] text-muted">
          <span className="font-mono text-[11.5px] font-semibold tracking-[0.14em] uppercase">Thinks with</span>
          {["OpenAI", "Anthropic", "Google Gemini", "OpenRouter"].map((p) => (
            <span key={p} className="font-semibold tracking-[-0.01em] text-ink-2">
              {p}
            </span>
          ))}
          <span>and 400+ models through them</span>
        </div>
      </div>
    </section>
  );
}

/** The app's frame around the demo board: what Pompi itself looks like. */
function AppChrome() {
  return (
    <div className="flex items-center justify-between border-b border-black/[0.06] bg-white px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="hidden gap-1.5 sm:flex">
          <span className="size-3 rounded-full bg-[#FF5F57]" />
          <span className="size-3 rounded-full bg-[#FEBC2E]" />
          <span className="size-3 rounded-full bg-[#28C840]" />
        </div>
        <div className="flex items-center gap-2 rounded-lg px-2 py-1">
          <LogoMark className="size-5" />
          <span className="text-[13px] text-muted">Acme</span>
          <span className="text-[13px] text-black/25">/</span>
          <span className="text-[13px] font-semibold">Friday launch</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden -space-x-1.5 sm:flex">
          {[
            ["M", "#9747FF"],
            ["S", "#0FA394"],
          ].map(([l, c]) => (
            <span key={l} className="flex size-7 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white" style={{ background: c }}>
              {l}
            </span>
          ))}
          {["#14AE5C", "#FF24BD", "#FF8A00"].map((c) => (
            <span key={c} className="flex size-7 items-center justify-center rounded-full border-2 border-white" style={{ background: `color-mix(in srgb, ${c} 22%, white)` }}>
              <Pom color={c} size={22} head />
            </span>
          ))}
        </div>
        <span className="rounded-lg bg-figblue px-3 py-1.5 text-[12px] font-semibold text-white">Share</span>
      </div>
    </div>
  );
}

function Steps() {
  const steps = [
    {
      title: "Add your team",
      body: "Make agents in a minute: a copywriter, an engineer, a researcher. Give each one a role and the tools it may use.",
      visual: (
        <div className="flex h-full flex-col justify-center gap-2 px-6">
          {[
            ["Juno", "Copywriter", "#FF24BD"],
            ["Dev", "Engineer", "#14AE5C"],
          ].map(([n, r, c]) => (
            <div key={n} className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/[0.05]">
              <span className="flex size-7 items-center justify-center rounded-full" style={{ background: `${c}22` }}>
                <Pom color={c} size={24} head />
              </span>
              <span className="text-[13px] font-semibold">{n}</span>
              <span className="text-[12px] text-muted">{r}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-black/15 px-3 py-2 text-[12.5px] font-medium text-muted">
            <Plus className="size-3.5" /> New agent
          </div>
        </div>
      ),
    },
    {
      title: "Write what you need",
      body: "Type anywhere on the board, like a sticky note, or say it out loud. No chat box and no tagging: Pompi works out who it's for.",
      visual: (
        <div className="flex h-full items-center justify-center">
          <span className="text-[22px] font-semibold tracking-[-0.01em]">
            craft the launch post<span className="ml-0.5 inline-block h-6 w-[2px] translate-y-1 animate-blink bg-figblue" />
          </span>
        </div>
      ),
    },
    {
      title: "Watch it get done",
      body: "The agent's cursor walks over and the work lands beside your note: a post, a page, research. It asks before anything risky.",
      visual: (
        <div className="relative flex h-full items-center justify-center">
          <div className="w-[210px] rounded-xl bg-white p-3 shadow-[0_12px_26px_-14px_rgba(0,0,0,0.35)] ring-1 ring-black/[0.05]">
            <p className="text-[11px] font-semibold text-[#FF24BD]">Juno · Launch post</p>
            <p className="mt-1 text-[12.5px] leading-snug">We&apos;re live! 🎉 Your AI team, on one board.</p>
            <div className="mt-2 flex gap-1.5">
              <span className="rounded-md bg-ink px-2 py-1 text-[10.5px] font-semibold text-white">Post it</span>
              <span className="rounded-md border border-black/10 px-2 py-1 text-[10.5px] font-semibold">Not now</span>
            </div>
          </div>
          <div className="absolute top-[64%] left-[70%] animate-float">
            <svg width="18" height="20" viewBox="0 0 20 22"><path d="M2.5 1.8v16.9c0 .5.6.7.9.4l4.4-4.6c.2-.2.5-.3.8-.3h6.6c.5 0 .7-.6.4-.9L3.4 1.4c-.3-.3-.9-.1-.9.4Z" fill="#FF24BD" stroke="white" strokeWidth="1.5" /></svg>
          </div>
        </div>
      ),
    },
  ];
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 pt-28 sm:px-8">
      <Tag>How it works</Tag>
      <H2 className="mt-4 max-w-3xl">
        From a note to done, <span className="text-black/35">in three steps.</span>
      </H2>
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="rounded-3xl bg-white p-2 ring-1 ring-black/[0.06]">
            <div className="pompi-canvas h-48 rounded-[20px]" style={{ backgroundSize: "18px 18px" }}>
              {s.visual}
            </div>
            <div className="px-4 pt-5 pb-5">
              <p className="font-mono text-[12px] font-semibold text-muted">{`0${i + 1}`}</p>
              <h3 className="mt-1.5 text-[21px] font-bold tracking-[-0.025em]">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.body}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-10 flex flex-col items-center">
        <StartButton />
      </div>
    </section>
  );
}

/* ---------------- features ---------------- */

/** A feature: a small picture of it on a bit of board, then what it does. */
function Tile({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-3xl bg-white p-2 ring-1 ring-black/[0.06]">
      <div className="pompi-canvas flex h-44 items-center justify-center overflow-hidden rounded-[20px] px-5" style={{ backgroundSize: "18px 18px" }}>
        {children}
      </div>
      <div className="px-4 pt-5 pb-5">
        <h3 className="text-[19px] font-bold tracking-[-0.025em]">{title}</h3>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}

const chip = "inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap shadow-[0_6px_14px_-10px_rgba(22,21,26,0.5)] ring-1 ring-black/[0.06]";

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 pt-32 sm:px-8">
      <div className="text-center">
        <Tag>More than a chatbot</Tag>
        <H2 className="mx-auto mt-4 max-w-3xl">
          Teammates that do the work, <span className="text-black/35">and get better at it.</span>
        </H2>
        <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-muted">Every agent has a computer, your apps, a memory and a schedule. You see all of it happen on the board.</p>
      </div>
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Tile title="Its own computer" body="A cloud desktop with a browser and a terminal. Agents read web pages as text, so browsing is fast, and build, test and deploy code. Watch the screen live, or take over.">
          <div className="w-full max-w-[290px] overflow-hidden rounded-xl bg-white shadow-[0_14px_30px_-16px_rgba(22,21,26,0.45)] ring-1 ring-black/[0.06]">
            <div className="flex items-center gap-1.5 border-b border-black/[0.06] px-3 py-2">
              <Globe className="size-3 text-muted" />
              <span className="truncate text-[11px] text-muted">news.ycombinator.com</span>
            </div>
            <div className="space-y-1 px-3 py-2.5 font-mono text-[10.5px] leading-snug">
              <p className="truncate">
                <span className="text-[#0D99FF]">[1]</span> link &quot;AI made self-hosting fun&quot;
              </p>
              <p className="truncate">
                <span className="text-[#0D99FF]">[2]</span> button &quot;More&quot;
              </p>
              <p className="flex items-center gap-1 truncate pt-1 text-[#14AE5C]">
                <SquareTerminal className="size-3" /> $ npm run build · done in 4s
              </p>
            </div>
          </div>
        </Tile>
        <Tile title="It remembers" body="Agents keep short notes on what they learn: your voice, your product, where things are. A shared team memory means every agent on the board knows it too.">
          <div className="flex flex-col items-center gap-2">
            <span className={chip}>
              <Brain className="size-3.5 text-[#7B4DFF]" /> Voice: playful, no emojis
            </span>
            <span className={`${chip} -translate-x-5`}>
              <Brain className="size-3.5 text-[#7B4DFF]" /> Site: pompi.cc
            </span>
            <span className={`${chip} translate-x-4`}>
              <Brain className="size-3.5 text-[#7B4DFF]" /> Repo: acme/landing
            </span>
          </div>
        </Tile>
        <Tile title="Works on a schedule" body="Write “every weekday at 9, check Hacker News” and it becomes a routine on the board. Each run's work lands beside it, in your time zone.">
          <div className="w-full max-w-[260px] rounded-xl bg-white p-3.5 shadow-[0_14px_30px_-16px_rgba(22,21,26,0.45)] ring-1 ring-black/[0.06]">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#0D99FF]">
              <Repeat className="size-3" /> Rae · Routine
            </p>
            <p className="mt-1 text-[15px] font-bold tracking-[-0.02em]">Every weekday at 09:00</p>
            <p className="mt-1 text-[12px] leading-snug text-muted">Check Hacker News and put the top 3 stories in a note.</p>
            <p className="mt-2 text-[11px] font-medium text-ink-2">Next run: Mon 09:00</p>
          </div>
        </Tile>
        <Tile title="Hands off to teammates" body="An agent does its part and passes the rest on: the copywriter writes, the engineer builds the page, the designer makes the image. Side by side, in parallel.">
          <div className="flex items-center gap-3">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-[#FFE6F8]">
              <Pom color="#FF24BD" size={46} head />
            </span>
            <ArrowRight className="size-4 text-black/30" />
            <div className="flex flex-col gap-2">
              {[
                ["#14AE5C", "#DDF6E5", "Dev builds the page"],
                ["#FF8A00", "#FFEBD6", "Ivy makes the image"],
              ].map(([c, bg, t]) => (
                <span key={t} className="flex items-center gap-2 rounded-full bg-white py-1 pr-3 pl-1 text-[12px] font-semibold shadow-sm ring-1 ring-black/[0.06]">
                  <span className="flex size-6 items-center justify-center rounded-full" style={{ background: bg }}>
                    <Pom color={c} size={20} head />
                  </span>
                  {t}
                </span>
              ))}
            </div>
          </div>
        </Tile>
        <Tile title="Your apps" body="GitHub, Notion, Slack, Gmail, X, Linear, Figma and 250+ more. You choose which agent may use which. Reading runs on its own; changes wait for your OK.">
          <div className="grid grid-cols-4 gap-2.5">
            {["github", "notion", "slack", "gmail", "x", "linear", "figma", "vercel"].map((t) => (
              <span key={t} className="flex size-11 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/[0.06]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/tools/${t}.svg`} alt="" width={22} height={22} className="size-[22px] object-contain" />
              </span>
            ))}
          </div>
        </Tile>
        <Tile title="Its own email" body="Every agent gets an address. Email it a brief and it lands in the board's Inbox; it drafts replies there, and nothing goes out until you OK it.">
          <div className="w-full max-w-[260px] rounded-xl bg-white p-3.5 shadow-[0_14px_30px_-16px_rgba(22,21,26,0.45)] ring-1 ring-black/[0.06]">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
              <Mail className="size-3" /> To juno@acme.pompi.email
            </p>
            <p className="mt-1 text-[14px] font-bold tracking-[-0.01em]">Brief for Friday&apos;s launch</p>
            <p className="mt-1 text-[12px] leading-snug text-muted">Three posts, warm and short. Link to the new page…</p>
          </div>
        </Tile>
      </div>
    </section>
  );
}

/* ---------------- models and limits ---------------- */

function Rules() {
  const dark = "rounded-3xl bg-white/[0.04] p-2 ring-1 ring-white/10";
  const stage = "flex h-44 items-center justify-center overflow-hidden rounded-[20px] bg-white/[0.04] px-5";
  return (
    <section id="models" className="mx-auto max-w-6xl scroll-mt-20 px-5 pt-32 sm:px-8">
      <div className="relative overflow-hidden rounded-[36px] bg-ink px-6 py-16 text-white sm:px-12 sm:py-20">
        <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1.3px)", backgroundSize: "22px 22px" }} />
        <div className="relative">
          <p className="font-mono text-[12px] font-semibold tracking-[0.14em] text-white/50 uppercase">Your models, your rules</p>
          <h2 className="mt-4 max-w-4xl text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1] font-bold tracking-[-0.045em]">
            Any model.
            <br />
            <span className="text-white/40">Your keys. Your limits.</span>
          </h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            <div className={dark}>
              <div className={`${stage} flex-wrap content-center gap-2`}>
                {["Claude Sonnet 5.5", "GPT-6.2 Sol", "Gemini Pro", "Kimi K3", "Qwen 4 Max", "DeepSeek V4"].map((m, i) => (
                  <span key={m} className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${i === 0 ? "bg-white text-ink" : "bg-white/10 text-white/80"}`}>
                    {m}
                  </span>
                ))}
              </div>
              <div className="px-4 pt-5 pb-5">
                <h3 className="text-[19px] font-bold tracking-[-0.025em]">A model for each agent</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-white/55">Claude for code, GPT for research, Gemini for speed: pick per agent from OpenAI, Anthropic, Google and OpenRouter.</p>
              </div>
            </div>
            <div className={dark}>
              <div className={`${stage} flex-col gap-2`}>
                {[
                  ["Anthropic", "••••3f2a", true],
                  ["OpenRouter", "••••9c01", true],
                  ["OpenAI", "Included", false],
                ].map(([n, v, own]) => (
                  <span key={String(n)} className="flex w-full max-w-[240px] items-center gap-2 rounded-xl bg-white/[0.07] px-3 py-2 text-[12.5px]">
                    <KeyRound className="size-3.5 text-white/50" />
                    <span className="font-semibold">{n}</span>
                    <span className={`ml-auto font-mono text-[11.5px] ${own ? "text-[#5BE39A]" : "text-white/50"}`}>{v}</span>
                  </span>
                ))}
              </div>
              <div className="px-4 pt-5 pb-5">
                <h3 className="text-[19px] font-bold tracking-[-0.025em]">Bring your own keys</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-white/55">Use the models in your plan, or add your own API key for any provider. It&apos;s stored encrypted and used only for your agents.</p>
              </div>
            </div>
            <div className={dark}>
              <div className={`${stage} flex-col gap-3`}>
                <div className="flex gap-1 rounded-full bg-white/10 p-1 text-[11.5px] font-semibold">
                  {["Ask first", "Auto", "Never ask"].map((m) => (
                    <span key={m} className={`rounded-full px-3 py-1.5 ${m === "Auto" ? "bg-white text-ink" : "text-white/60"}`}>
                      {m}
                    </span>
                  ))}
                </div>
                <div className="w-full max-w-[240px] rounded-xl bg-white p-3 text-ink">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#14AE5C]">
                    <ShieldCheck className="size-3.5" /> Dev wants to deploy
                  </p>
                  <p className="mt-1 text-[12.5px] leading-snug">Push the landing page to production?</p>
                  <div className="mt-2 flex gap-1.5">
                    <span className="rounded-md bg-ink px-2 py-1 text-[10.5px] font-semibold text-white">Approve</span>
                    <span className="rounded-md border border-black/10 px-2 py-1 text-[10.5px] font-semibold">Not now</span>
                  </div>
                </div>
              </div>
              <div className="px-4 pt-5 pb-5">
                <h3 className="text-[19px] font-bold tracking-[-0.025em]">You set the limits</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-white/55">Agents ask before anything that publishes, sends, pays or deletes. Or turn on Auto: a reviewer lets through what plainly matches what you asked.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- compare ---------------- */

function Compare() {
  const chat = ["Paste the brief into every new chat", "One agent at a time, one tab each", "No idea what's running or done", "Approvals buried in a thread"];
  const pompi = ["Everyone works from the same board", "Agents work side by side, in parallel", "See every step live, as it happens", "Approve right next to the work"];
  return (
    <section className="mx-auto max-w-6xl px-5 pt-32 sm:px-8">
      <div className="text-center">
        <Tag>Why a board</Tag>
        <H2 className="mx-auto mt-4 max-w-3xl">
          Not another chat tab.
        </H2>
        <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-muted">Chat apps hide your agents in separate windows. Pompi puts the whole team, and all their work, where you can see it.</p>
      </div>
      <div className="mx-auto mt-12 grid max-w-4xl overflow-hidden rounded-3xl ring-1 ring-black/[0.07] md:grid-cols-2">
        <div className="bg-[#F1F0EC] p-8">
          <p className="text-[15px] font-semibold text-muted">Chat apps</p>
          <ul className="mt-5 space-y-4">
            {chat.map((c) => (
              <li key={c} className="flex items-start gap-3 text-[15.5px] text-muted">
                <X className="mt-0.5 size-[18px] shrink-0 text-black/30" /> {c}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white p-8">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <LogoMark className="size-5" /> Pompi
          </p>
          <ul className="mt-5 space-y-4">
            {pompi.map((c) => (
              <li key={c} className="flex items-start gap-3 text-[15.5px] font-medium">
                <span className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full bg-[#14AE5C] text-white">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------------- pricing ---------------- */

function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 pt-32 sm:px-8">
      <div className="text-center">
        <Tag>Pricing</Tag>
        <H2 className="mx-auto mt-4 max-w-3xl">One team. Pick how hard it works.</H2>
        <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-muted">Every plan has unlimited boards, agents and teammates, and your own cloud computer. Plans differ in how much your agents can do each month.{TRIAL_OPEN ? " Try it free for 3 days first, no card needed." : ""}</p>
      </div>
      <div className="mx-auto mt-14 grid max-w-5xl gap-4 md:grid-cols-3 md:items-stretch">
        {PAID_PLANS.map((key) => {
          const p = PLANS[key];
          const popular = key === "pro";
          return (
            <div
              key={key}
              className={`relative flex flex-col rounded-[28px] p-7 ${popular ? "bg-ink text-white shadow-[0_40px_80px_-40px_rgba(22,21,26,0.9)] md:-my-3 md:py-10" : "bg-white shadow-[0_30px_70px_-45px_rgba(22,21,26,0.45)] ring-1 ring-black/[0.06]"}`}
            >
              {popular ? (
                <span className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-full bg-[#FFE48C] px-2.5 py-1 text-[11.5px] font-bold text-ink">
                  <Sparkles className="size-3.5" /> Most popular
                </span>
              ) : null}
              <p className="text-[17px] font-semibold">{p.name}</p>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="text-[48px] leading-none font-bold tracking-[-0.045em]">${p.price}</span>
                <span className={`text-[15px] ${popular ? "text-white/55" : "text-muted"}`}>/month</span>
              </p>
              <p className={`mt-3 text-[14.5px] leading-snug ${popular ? "text-white/65" : "text-muted"}`}>{p.blurb}</p>
              <ul className={`mt-6 space-y-3 border-t pt-6 ${popular ? "border-white/10" : "border-black/[0.06]"}`}>
                {features(p).map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[14.5px]">
                    <Check className={`mt-0.5 size-[17px] shrink-0 ${popular ? "text-[#5BE39A]" : "text-[#14AE5C]"}`} strokeWidth={2.5} /> {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/app"
                className={`group mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold transition-colors md:mt-auto ${popular ? "bg-white text-ink hover:bg-white/90" : "bg-ink text-white hover:bg-black"}`}
              >
                Get {p.name} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          );
        })}
      </div>
      {TRIAL_OPEN ? (
      <div className="mx-auto mt-8 flex max-w-5xl flex-col items-center gap-5 rounded-[28px] bg-[#F3EEFF] p-6 ring-1 ring-[#7B4DFF]/15 sm:flex-row sm:p-7">
        <Pom color="#7B4DFF" size={72} head />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-[19px] font-bold tracking-[-0.02em]">Not sure yet? Try it free for 3 days.</p>
          <p className="mt-1.5 text-[14.5px] leading-snug text-muted">
            {PLANS.trial.answers} agent answers and {PLANS.trial.computerTasks} computer tasks, on us. No card needed, and the clock only starts when you first ask an agent for something.
          </p>
        </div>
        <Link href="/app" className="group flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#7B4DFF] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#6A3BF0]">
          Start free <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
      ) : null}
      <p className="mx-auto mt-10 max-w-2xl text-center text-[14px] leading-relaxed text-muted">
        An answer is one reply from an agent on your board; a computer task is one job it does on your computer, like checking a site or shipping a change. Change or cancel any time. Prefer to run it yourself?{" "}
        <a href={GITHUB} className="font-medium text-ink underline underline-offset-4">
          Pompi is open source
        </a>
        .
      </p>
    </section>
  );
}

/* ---------------- faq ---------------- */

function Faq() {
  const qs = [
    ["What is Pompi?", "A shared whiteboard, like FigJam, where some of your teammates are AI agents. You write or say what you need on the board, and the right agent picks it up and does the work there, where everyone can see it."],
    ["How do I tell an agent what to do?", "Just write on the board, anywhere, or talk. There's no chat box and you don't have to tag anyone: Pompi works out which agent the note is for. You can still start with a name, like \"Juno, …\", if you want a specific one."],
    ["What can the agents actually do?", "Write posts, emails and pages; research the web; use the apps you connect (GitHub, Notion, Slack, X and 250+ more); and work on your own cloud computer to browse, code and deploy. They also remember what they learn, and can work on a schedule."],
    ["Which AI models can they use?", "Pick one per agent: OpenAI (GPT), Anthropic (Claude), Google (Gemini), or hundreds more through OpenRouter, like Kimi, Qwen, Grok and DeepSeek. Every agent can use the web, your apps and the computer, whichever model it thinks with."],
    ["Can I use my own API keys?", "Yes. Add a key for any provider in an agent's settings, and every agent on the boards you own uses it. Keys are stored encrypted, only used to run your agents, and you can remove them any time."],
    ["Do agents remember things?", "Yes. Each agent keeps short notes from its work, and each board has a team memory every agent reads: your product, your voice, who's who. They never save passwords or keys, and you can read, edit or clear every note."],
    ["Can agents work on a schedule?", "Yes. Write something like “every Monday at 9, summarise last week's signups” and the agent sets up a routine. It shows on the board, where you can run it now, pause it or delete it."],
    ["Will an agent do something without asking?", "Not unless you let it. By default, before posting, sending, paying, deleting or publishing, the agent raises its hand on the board and waits for your OK. On Auto, a reviewer lets through what plainly matches what you asked and still checks the rest with you. Emails always wait for your OK."],
    ["What does it cost?", `${TRIAL_OPEN ? "Your first 3 days are free, no card needed: the trial starts with your first request to an agent and includes 40 answers and 3 computer tasks. After that, plans" : "Plans"} are $19, $59 or $100 a month. Each includes your own cloud computer and a monthly amount of agent answers and computer tasks; the bigger the plan, the more your agents can do. Change or cancel any time.`],
    ["What if I run out?", "Your agents tell you on the board when the month's answers or computer tasks are used up. Upgrade in a click, or they start over on the 1st."],
    ["Who pays on a shared board?", "The board's owner. Agents on your boards work on your plan, whoever asks them, so the people you invite never need a plan of their own."],
    ["Can I run it myself?", "Yes. Pompi is open source under the MIT license. Run it with your own keys, read every line, and change whatever you like."],
  ];
  return (
    <section id="faq" className="mx-auto max-w-6xl scroll-mt-20 px-5 pt-32 sm:px-8">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <Tag>FAQ</Tag>
          <H2 className="mt-4">
            Questions,
            <br />
            <span className="text-black/35">answered.</span>
          </H2>
          <p className="mt-5 text-[15px] text-muted">
            Something else? <a href={`${GITHUB}/issues`} className="font-medium text-ink underline underline-offset-4">Ask on GitHub</a>.
          </p>
        </div>
        <div className="divide-y divide-black/[0.07] border-y border-black/[0.07]">
          {qs.map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[17px] font-semibold tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- final call ---------------- */

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 pt-32 pb-24 sm:px-8">
      <div className="relative overflow-hidden rounded-[36px] bg-ink px-8 py-20 text-center text-white sm:py-24">
        <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1.3px)", backgroundSize: "22px 22px" }} />
        <div className="pointer-events-none absolute top-10 left-[8%] hidden rotate-[-8deg] rounded-[3px] bg-[#FFE48C] p-4 text-left text-[15px] leading-tight font-semibold text-ink shadow-xl md:block">
          ship the
          <br />
          landing page
        </div>
        <div className="pointer-events-none absolute right-[8%] bottom-12 hidden rotate-[6deg] rounded-[3px] bg-[#A6D9FF] p-4 text-left text-[15px] leading-tight font-semibold text-ink shadow-xl md:block">
          research
          <br />
          competitors
        </div>
        <div className="relative">
          <LogoMark className="mx-auto size-14" />
          <h2 className="mx-auto mt-7 max-w-2xl text-[clamp(2.4rem,5vw,4rem)] leading-[0.98] font-bold tracking-[-0.05em] text-balance">Put your AI team on the board.</h2>
          <p className="mx-auto mt-5 max-w-md text-[17px] leading-relaxed text-white/60">Start a board, add a teammate, and write your first task. It takes a minute.</p>
          <div className="mt-9 flex flex-col items-center">
            <StartButton big light />
            <Reassure light />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- footer ---------------- */

function Footer() {
  const cols = [
    { title: "Product", links: [["How it works", "#how"], ["Features", "#features"], ["Models", "#models"], ["Pricing", "#pricing"], ["FAQ", "#faq"]] },
    { title: "Open source", links: [["GitHub", GITHUB], ["Report an issue", `${GITHUB}/issues`], ["MIT license", `${GITHUB}/blob/main/LICENSE`]] },
    { title: "Account", links: [["Sign in", "/login"], ["Your boards", "/app"]] },
  ];
  return (
    <footer className="border-t border-black/[0.06]">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-[14px] leading-relaxed text-muted">A shared whiteboard where your teammates are AI agents.</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="text-[13px] font-semibold">{c.title}</p>
            <ul className="mt-3 space-y-2 text-[14px] text-muted">
              {c.links.map(([label, href]) => (
                <li key={label}>
                  <a href={href} className="hover:text-ink">{label}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-6xl justify-between border-t border-black/[0.06] px-5 py-6 text-[13px] text-muted sm:px-8">
        <p>© {new Date().getFullYear()} Pompi contributors</p>
        <p>MIT licensed</p>
      </div>
    </footer>
  );
}
