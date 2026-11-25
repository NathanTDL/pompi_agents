import Link from "next/link";
import { ArrowRight, CalendarCheck, Code2, Inbox, Palette, PenLine, Plus, Search, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Pom } from "@/components/canvas/pom";

/**
 * "Give every Pom a job": the roles people hire on day one, each a Pom holding
 * the tool of its trade, beside the note you'd write it. Hovering a card makes
 * its Pom hop and the note straighten up, as if it's just been picked up.
 */

type Job = { name: string; role: string; color: string; sticky: string; icon: LucideIcon; job: string; note: string; tools: string[] };

const JOBS: Job[] = [
  { name: "Dev", role: "Engineer", color: "#14AE5C", sticky: "#B3EFBD", icon: Code2, job: "Builds and ships pages on its own computer.", note: "turn these notes into a landing page", tools: ["github", "vercel"] },
  { name: "Juno", role: "Copywriter", color: "#FF24BD", sticky: "#FFBDF2", icon: PenLine, job: "Writes posts, pages and emails in your voice.", note: "3 tweets for Friday's launch", tools: ["x", "notion"] },
  { name: "Rae", role: "Researcher", color: "#0D99FF", sticky: "#A6D9FF", icon: Search, job: "Digs up the facts and brings back the links.", note: "what do our competitors charge?", tools: ["googledrive", "notion"] },
  { name: "Ivy", role: "Designer", color: "#FF8A00", sticky: "#FFD3A8", icon: Palette, job: "Sketches layouts and makes the images.", note: "a cover image for the blog post", tools: ["figma"] },
  { name: "Sal", role: "Sales", color: "#F24822", sticky: "#FFC7BA", icon: Send, job: "Finds leads and drafts the follow-ups.", note: "find 20 founders who'd love this", tools: ["hubspot", "gmail"] },
  { name: "Mo", role: "Inbox", color: "#7B4DFF", sticky: "#DCCCFF", icon: Inbox, job: "Sorts your email and drafts the replies.", note: "answer the support emails", tools: ["gmail", "slack"] },
  { name: "Theo", role: "Chief of staff", color: "#0FA394", sticky: "#AFF4E6", icon: CalendarCheck, job: "Plans the week and hands out the work.", note: "split the launch into tasks", tools: ["linear", "googlecalendar"] },
];

export function Jobs() {
  return (
    <section id="roles" className="mx-auto max-w-6xl scroll-mt-20 px-5 pt-32 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="inline-flex items-center font-mono text-[12px] font-semibold tracking-[0.14em] text-muted uppercase">Pick your team</p>
          <h2 className="mt-4 text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1] font-bold tracking-[-0.045em] text-balance">
            Give every Pom a job.
            <br />
            <span className="text-black/35">Then just talk to it.</span>
          </h2>
        </div>
        <p className="max-w-sm text-[17px] leading-relaxed text-muted">Start from a role or write your own in a sentence. Each Pom gets a name, its own email and the tools you allow.</p>
      </div>

      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {JOBS.map((j, i) => (
          <JobCard key={j.name} j={j} i={i} />
        ))}
        <YourOwn />
      </div>
    </section>
  );
}

function JobCard({ j, i }: { j: Job; i: number }) {
  const odd = i % 2 === 1;
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-[28px] bg-white ring-1 ring-black/[0.06] transition-all duration-300 hover:-translate-y-1.5"
      style={{ ["--c" as string]: j.color, boxShadow: "0 1px 0 rgba(0,0,0,0.02)" }}
    >
      {/* A coloured glow under the card, only on hover. */}
      <div className="pointer-events-none absolute inset-0 rounded-[28px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ boxShadow: `0 24px 44px -28px ${j.color}66, inset 0 0 0 1.5px ${j.color}40` }} />

      {/* The stage: a patch of board with the note and the Pom on it. */}
      <div
        className="relative h-[208px] overflow-hidden"
        style={{
          background: `color-mix(in srgb, ${j.color} 9%, white)`,
          backgroundImage: `radial-gradient(color-mix(in srgb, ${j.color} 28%, transparent) 1.1px, transparent 1.2px)`,
          backgroundSize: "16px 16px",
        }}
      >
        <div className="absolute -right-6 -bottom-10 size-40 rounded-full opacity-20 blur-3xl transition-all duration-500 group-hover:scale-110 group-hover:opacity-35" style={{ background: j.color }} />

        <div
          className={`pompi-sticky absolute top-5 left-4 w-[128px] rounded-[3px] px-3 pt-2.5 pb-3 transition-transform duration-300 ease-[cubic-bezier(0.3,1.4,0.6,1)] group-hover:scale-105 group-hover:rotate-0 ${odd ? "rotate-[3deg]" : "rotate-[-3deg]"}`}
          style={{ background: j.sticky }}
        >
          <p className="text-[14.5px] leading-[1.25] font-semibold tracking-[-0.01em] text-ink">{j.note}</p>
        </div>

        <div className="absolute right-3 bottom-1 animate-float" style={{ animationDelay: `${-i * 0.8}s` }}>
          <div className="relative transition-transform duration-300 ease-[cubic-bezier(0.3,1.6,0.5,1)] group-hover:-translate-y-3 group-hover:-rotate-6">
            <Pom color={j.color} size={118} />
            {/* What it holds: the tool of its trade. */}
            <span
              className={`absolute top-[57%] left-1/2 flex size-[42px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[12px] bg-white shadow-[0_6px_14px_-6px_rgba(22,21,26,0.45)] ring-1 ring-black/[0.06] transition-transform duration-300 group-hover:rotate-[10deg] ${odd ? "-rotate-[4deg]" : "rotate-[4deg]"}`}
            >
              <j.icon className="size-[21px]" style={{ color: j.color }} strokeWidth={2.3} />
            </span>
          </div>
        </div>

        {/* On hover: its cursor, heading for the note. */}
        <div className="absolute top-[118px] left-[26px] flex translate-x-6 translate-y-4 items-start opacity-0 transition-all duration-500 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100">
          <svg width="16" height="18" viewBox="0 0 20 22" className="drop-shadow-sm">
            <path d="M2.5 1.8v16.9c0 .5.6.7.9.4l4.4-4.6c.2-.2.5-.3.8-.3h6.6c.5 0 .7-.6.4-.9L3.4 1.4c-.3-.3-.9-.1-.9.4Z" fill={j.color} stroke="white" strokeWidth="1.5" />
          </svg>
          <span className="mt-3 -ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white shadow-sm" style={{ background: j.color }}>
            {j.name} · on it
          </span>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2">
          <p className="text-[19px] font-bold tracking-[-0.025em]">{j.name}</p>
          <span className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: `color-mix(in srgb, ${j.color} 13%, white)`, color: `color-mix(in srgb, ${j.color} 75%, black)` }}>
            {j.role}
          </span>
        </div>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{j.job}</p>
        <div className="mt-auto flex items-center gap-1.5 pt-4">
          {j.tools.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={t} src={`/tools/${t}.svg`} alt="" width={16} height={16} className="size-[22px] rounded-md bg-[#F4F3F7] object-contain p-[3px]" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** The eighth card: any job you can describe. */
function YourOwn() {
  return (
    <Link
      href="/app"
      className="group relative flex flex-col overflow-hidden rounded-[28px] border-2 border-dashed border-black/[0.12] bg-white/60 transition-all duration-300 hover:-translate-y-1.5 hover:border-[#7B4DFF]/50 hover:bg-white"
    >
      <div className="relative flex h-[204px] items-center justify-center overflow-hidden">
        <div className="absolute size-40 rounded-full bg-[conic-gradient(from_0deg,#FF24BD,#FF8A00,#14AE5C,#0D99FF,#7B4DFF,#FF24BD)] opacity-10 blur-3xl transition-all duration-700 group-hover:rotate-180 group-hover:opacity-25" />
        <div className="relative grayscale transition-all duration-500 group-hover:-translate-y-2 group-hover:grayscale-0">
          <Pom color="#9B7BFF" size={112} />
          <span className="absolute top-[57%] left-1/2 flex size-[40px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[12px] bg-ink text-white shadow-lg transition-transform duration-300 group-hover:rotate-90">
            <Plus className="size-5" strokeWidth={2.6} />
          </span>
        </div>
        <p className="absolute top-5 left-5 rounded-full bg-[#7B4DFF]/10 px-2.5 py-1 text-[12px] font-semibold text-[#7B4DFF]">You name it…</p>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-[19px] font-bold tracking-[-0.025em]">Your own</p>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">Describe any job in a sentence. If you can say it, a Pom can do it.</p>
        <p className="mt-auto flex items-center gap-1 pt-4 text-[13.5px] font-semibold text-[#7B4DFF]">
          Make a Pom <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
        </p>
      </div>
    </Link>
  );
}
