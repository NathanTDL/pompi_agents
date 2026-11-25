import Link from "next/link";
import { Caveat } from "next/font/google";
import { ArrowRight, AtSign, Blocks, Check, ChevronDown, Hand, Mail, Mic, MonitorSmartphone, Plus, Sparkles, X } from "lucide-react";
import { Logo, LogoMark, GithubMark } from "@/components/brand/logo";
import { Pom } from "@/components/canvas/pom";
import { HeroDemo } from "@/components/landing/hero-demo";
import { Jobs } from "@/components/landing/jobs";
import { RotatingWord } from "@/components/landing/rotating-word";
import { features, PAID_PLANS, PLANS } from "@/convex/plans";

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
      <Teammate />
      <Compare />
      <Examples />
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
      Start free <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Small print under a main button: what people worry about before they click. */
function Reassure({ light }: { light?: boolean }) {
  return <p className={`mt-3 text-[13px] ${light ? "text-white/55" : "text-muted"}`}>3 days free, no card · Then from $19 a month · Works in your browser</p>;
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
          <a href="#teammates" className="hover:text-ink">Teammates</a>
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
            Start free
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

/* ---------------- teammate, not a chatbot ---------------- */

function Teammate() {
  const perks = [
    { icon: MonitorSmartphone, title: "A computer to work on", body: "Each board has a cloud computer its agents share. Watch them browse and build, or take over yourself." },
    { icon: Mail, title: "Its own email", body: "Email an agent a brief. It lands in the board's Inbox and gets picked up." },
    { icon: Blocks, title: "The tools you pick", body: "GitHub, Notion, Slack, X and 250+ apps. You choose which agent may use which." },
    { icon: Hand, title: "Asks before anything risky", body: "Posting, sending, paying or deleting waits for your OK, right on the board." },
    { icon: Mic, title: "Hears you", body: "Talk instead of typing. Your words land on the board for the right agent." },
  ];
  return (
    <section id="teammates" className="mx-auto max-w-6xl scroll-mt-20 px-5 pt-32 sm:px-8">
      <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <Tag>Every agent comes with</Tag>
          <H2 className="mt-4">
            A teammate,
            <br />
            <span className="text-black/35">not a chatbot.</span>
          </H2>
          <ul className="mt-10 space-y-6">
            {perks.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-ink ring-1 ring-black/[0.07]">
                  <p.icon className="size-[18px]" />
                </span>
                <div>
                  <p className="text-[16.5px] font-semibold tracking-[-0.01em]">{p.title}</p>
                  <p className="mt-0.5 text-[15px] leading-relaxed text-muted">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <AgentCard />
      </div>
    </section>
  );
}

/** An agent's card, as you'd see it in Pompi: who it is and what it may do. */
function AgentCard() {
  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      <div className="absolute -inset-6 rotate-[-3deg] rounded-[36px] bg-[#FFBDF2]/60" />
      <div className="relative overflow-hidden rounded-[28px] bg-white shadow-[0_30px_70px_-30px_rgba(22,21,26,0.45)] ring-1 ring-black/[0.06]">
        <div className="flex items-center justify-between bg-[#FF24BD] px-6 py-3 font-mono text-[11px] font-semibold tracking-[0.14em] text-white uppercase">
          <span>Teammate</span>
          <span>Acme · Friday launch</span>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-4">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-[#FFE6F8]">
              <Pom color="#FF24BD" size={56} head />
            </span>
            <div>
              <p className="text-[24px] font-bold tracking-[-0.03em]">Juno</p>
              <p className="text-[14px] text-muted">Copywriter · writes posts, emails and pages</p>
            </div>
          </div>
          <dl className="mt-6 divide-y divide-black/[0.06] text-[14px]">
            {[
              ["Email", "juno@acme.pompi.email"],
              ["Computer", "Shares the board's computer"],
              ["Tools", "X · Notion · Gmail"],
              ["Rules", "Asks before posting anything"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 py-3">
                <dt className="font-mono text-[11.5px] font-semibold tracking-[0.1em] text-muted uppercase">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex items-center gap-2 rounded-2xl bg-[#F4F3F7] px-4 py-3 text-[13.5px]">
            <span className="size-2 animate-pulse rounded-full bg-[#14AE5C]" />
            <span className="font-medium">Writing the launch post</span>
            <span className="ml-auto text-muted">just now</span>
          </div>
        </div>
      </div>
    </div>
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

/* ---------------- examples ---------------- */

function Examples() {
  const cases = [
    { you: "turn these stickies into a landing page", who: "Dev · Engineer", what: "The notes get sorted, written up and built into a live page right beside them.", color: "#14AE5C", sticky: "#B3EFBD" },
    { you: "what do our top 3 competitors charge?", who: "Rae · Researcher", what: "Rae browses the web and comes back with one tidy note per competitor, with links.", color: "#0D99FF", sticky: "#A6D9FF" },
    { you: "make 3 tweets about the sale", who: "Juno · Copywriter", what: "Three editable post cards appear. When you're happy, Juno asks before posting.", color: "#FF24BD", sticky: "#FFBDF2" },
  ];
  return (
    <section className="mx-auto max-w-6xl px-5 pt-32 sm:px-8">
      <Tag>On day one</Tag>
      <H2 className="mt-4 max-w-3xl">
        You write it. <span className="text-black/35">They get it done.</span>
      </H2>
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {cases.map((c, i) => (
          <div key={c.you} className="flex flex-col rounded-3xl bg-white p-6 ring-1 ring-black/[0.06]">
            <div className="pompi-sticky rounded-[3px] p-4" style={{ background: c.sticky, transform: `rotate(${i % 2 ? 1.5 : -1.5}deg)` }}>
              <p className="flex items-center gap-1 text-[11px] font-semibold opacity-50">
                <AtSign className="size-3" /> You wrote
              </p>
              <p className="mt-1 text-[19px] leading-snug font-semibold tracking-[-0.015em]">{c.you}</p>
            </div>
            <p className="mt-6 flex items-center gap-2 text-[13px] font-semibold" style={{ color: c.color }}>
              <Sparkles className="size-3.5" /> {c.who}
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{c.what}</p>
          </div>
        ))}
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
        <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-muted">Every plan has unlimited boards, agents and teammates, and your own cloud computer. Plans differ in how much your agents can do each month. Try it free for 3 days first, no card needed.</p>
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
    ["What can the agents actually do?", "Write posts, emails and pages; research the web; use the apps you connect (GitHub, Notion, Slack, X and 250+ more); and work on the board's own cloud computer to browse, code and deploy."],
    ["Will an agent do something without asking?", "Not anything risky. Before posting, sending, paying, deleting or publishing, the agent raises its hand on the board and waits for your OK."],
    ["What does it cost?", "Your first 3 days are free, no card needed: the trial starts with your first request to an agent and includes 40 answers and 3 computer tasks. After that, plans are $19, $59 or $100 a month. Each includes your own cloud computer and a monthly amount of agent answers and computer tasks; the bigger the plan, the more your agents can do. Change or cancel any time."],
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
    { title: "Product", links: [["How it works", "#how"], ["Teammates", "#teammates"], ["Pricing", "#pricing"], ["FAQ", "#faq"]] },
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
