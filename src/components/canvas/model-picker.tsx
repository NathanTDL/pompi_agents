"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Check, ChevronDown, ExternalLink, KeyRound, LoaderCircle, Lock, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Which model an agent thinks with (convex/models.ts): a menu of the models,
 * by provider. Those this Pompi pays for, or the board's owner added their own
 * key for, can be picked; the rest say what they need.
 */

/** Each provider's colour and mark, for its badge. */
const BRAND: Record<string, { bg: string; fg: string; mark: string }> = {
  openai: { bg: "#111014", fg: "#FFFFFF", mark: "O" },
  anthropic: { bg: "#D97757", fg: "#FFFFFF", mark: "A" },
  google: { bg: "#E8F0FE", fg: "#1A73E8", mark: "G" },
  openrouter: { bg: "#6566F1", fg: "#FFFFFF", mark: "R" },
};

function Badge({ provider, size = 28 }: { provider: string; size?: number }) {
  const b = BRAND[provider] ?? { bg: "#EEEDF2", fg: "#55525F", mark: "?" };
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[9px] font-bold tracking-[-0.02em] ring-1 ring-black/[0.06]" style={{ width: size, height: size, background: b.bg, color: b.fg, fontSize: size * 0.46 }}>
      {b.mark}
    </span>
  );
}

/** "gpt-6.1-sol" -> "GPT-6.1 Sol", for a model the list doesn't name. */
const pretty = (id: string) =>
  id
    .split("/")
    .pop()!
    .split("-")
    .map((w, i) => (i === 0 && /^gpt$/i.test(w) ? "GPT" : /^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
    .replace(/^GPT (\d)/, "GPT-$1");

export type Options = NonNullable<ReturnType<typeof useQuery<typeof api.models.options>>>;

export function ModelPicker({ boardId, value, onChange }: { boardId: Id<"boards">; value: string; onChange: (ref: string) => void }) {
  const o = useQuery(api.models.options, { boardId });
  if (!o) return <div className="mt-1.5 h-[58px] animate-pulse rounded-2xl bg-black/[0.04]" />;
  return <ModelPickerView o={o} value={value} onChange={onChange} />;
}

/** The picker itself, given the board's options. */
export function ModelPickerView({ o, value, onChange, defaultOpen = false, defaultKeys = false }: { o: Options; value: string; onChange: (ref: string) => void; defaultOpen?: boolean; defaultKeys?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [keys, setKeys] = React.useState(defaultKeys);
  const button = React.useRef<HTMLButtonElement>(null);

  const chosen = o.models.find((m) => m.ref === value);
  const defaultRef = o.default;
  const defaultModel = o.models.find((m) => m.ref === defaultRef);
  const defaultName = defaultModel?.name ?? pretty(defaultRef);
  const shown = chosen ?? { ref: "", name: `Default · ${defaultName}`, blurb: "Whatever this Pompi uses unless you pick one", provider: defaultRef.split("/")[0], vision: true, ready: true };
  const missing = !!chosen && !chosen.ready;

  return (
    <div>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`mt-1.5 flex w-full items-center gap-3 rounded-2xl border bg-white px-3 py-2.5 text-left transition-all hover:border-black/20 ${open ? "border-black/25 ring-4 ring-black/[0.05]" : "border-line"}`}
      >
        <Badge provider={shown.provider} size={34} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold tracking-[-0.01em]">{shown.name}</span>
          <span className="block truncate text-[12px] text-muted">{shown.blurb}</span>
        </span>
        {missing ? <span className="shrink-0 rounded-full bg-[#FFF4DB] px-2 py-0.5 text-[11px] font-semibold text-[#A86B00]">Needs a key</span> : null}
        <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <p className="mt-1.5 flex items-center justify-between gap-2 text-[11.5px] text-muted">
        <span className={missing ? "text-[#A86B00]" : ""}>
          {missing
            ? `No ${o.providers.find((p) => p.id === chosen.provider)?.name} key yet: it uses the default until one's added.`
            : chosen && !chosen.vision
              ? "Can't see the screen: it reads web pages as text and uses the terminal."
              : "Every model can use the web, your apps and the computer."}
        </span>
        {o.isOwner ? (
          <button type="button" onClick={() => setKeys((k) => !k)} className="flex shrink-0 items-center gap-1 font-semibold text-ink-2 hover:text-ink">
            <KeyRound className="size-3" /> {keys ? "Hide keys" : "Your API keys"}
          </button>
        ) : null}
      </p>
      {keys && o.isOwner ? <ApiKeys providers={o.providers} /> : null}

      {open ? (
        <Menu
          anchor={button}
          o={o}
          value={value}
          defaultName={defaultName}
          onPick={(ref) => {
            onChange(ref);
            setOpen(false);
          }}
          onAddKey={() => {
            setOpen(false);
            setKeys(true);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** The menu, over everything (the dialog scrolls, and would cut it off), under the button or above it. */
function Menu({ anchor, o, value, defaultName, onPick, onAddKey, onClose }: { anchor: React.RefObject<HTMLButtonElement | null>; o: Options; value: string; defaultName: string; onPick: (ref: string) => void; onAddKey: () => void; onClose: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [at, setAt] = React.useState<{ left: number; width: number; top?: number; bottom?: number; max: number } | null>(null);

  React.useLayoutEffect(() => {
    const place = () => {
      if (!anchor.current) return;
      const r = anchor.current.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const max = Math.min(420, Math.max(below, above) - 8);
      setAt(below >= 300 || below >= above ? { left: r.left, width: r.width, top: r.bottom + 6, max } : { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 6, max });
    };
    place();
    window.addEventListener("resize", place);
    // The dialog scrolling moves the button: the menu goes.
    const scrolled = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("scroll", scrolled, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", scrolled, true);
    };
  }, [anchor, onClose]);

  React.useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, [anchor, onClose]);

  if (!at || typeof document === "undefined") return null;
  const groups = o.providers.map((p) => ({ ...p, models: o.models.filter((m) => m.provider === p.id) }));
  return createPortal(
    <div
      ref={ref}
      data-ui
      role="listbox"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
      className="fixed z-[110] animate-pop overflow-y-auto overscroll-contain rounded-2xl bg-white p-1.5 shadow-[0_24px_60px_-18px_rgba(22,21,26,0.45)] ring-1 ring-black/[0.08]"
      style={{ left: at.left, width: at.width, top: at.top, bottom: at.bottom, maxHeight: at.max }}
    >
      <Row on={!value} onClick={() => onPick("")}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[#F3EEFF] text-[#7B4DFF]">
          <Sparkles className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold">Default</span>
          <span className="block truncate text-[11.5px] text-muted">{defaultName}, unless you pick one</span>
        </span>
      </Row>
      {groups.map((g) => {
        const ready = g.pompi || g.own;
        return (
          <div key={g.id} className="mt-1 border-t border-black/[0.05] pt-1">
            <div className="flex items-center gap-2 px-2.5 pt-1.5 pb-1">
              <Badge provider={g.id} size={18} />
              <span className="text-[11.5px] font-semibold tracking-[0.02em] text-ink-2">{g.name}</span>
              {g.own ? (
                <span className="ml-auto rounded-full bg-[#E3F8EA] px-2 py-0.5 text-[10.5px] font-semibold text-[#0E8A47]">Your key</span>
              ) : g.pompi ? (
                <span className="ml-auto rounded-full bg-black/[0.04] px-2 py-0.5 text-[10.5px] font-semibold text-muted">Included</span>
              ) : o.isOwner ? (
                <button type="button" onClick={onAddKey} className="ml-auto flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[10.5px] font-semibold text-white hover:bg-black">
                  <KeyRound className="size-2.5" /> Add a key
                </button>
              ) : (
                <span className="ml-auto text-[10.5px] text-muted">The owner can add a key</span>
              )}
            </div>
            {g.models.map((m) => (
              <Row key={m.ref} on={m.ref === value} disabled={!ready} onClick={() => onPick(m.ref)}>
                <span className="min-w-0 flex-1 pl-1">
                  <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                    {m.name}
                    {!m.vision ? <span className="rounded-full bg-black/[0.05] px-1.5 py-px text-[10px] font-semibold text-muted">Text only</span> : null}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted">{m.blurb}</span>
                </span>
                {!ready ? <Lock className="size-3.5 shrink-0 text-black/25" /> : null}
              </Row>
            ))}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

function Row({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={on}
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${on ? "bg-[#F4F3F7]" : "hover:bg-black/[0.035]"}`}
    >
      {children}
      {on ? <Check className="size-4 shrink-0 text-ink" strokeWidth={2.5} /> : null}
    </button>
  );
}

type ProviderRow = { id: string; name: string; keyHint: string; keysUrl: string; pompi: boolean; own: boolean };

/** The owner's own keys, one per provider. The agents on boards they own use them. */
function ApiKeys({ providers }: { providers: ProviderRow[] }) {
  const mine = useQuery(api.models.myKeys);
  return (
    <div className="mt-2 overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.07]">
      <p className="border-b border-black/[0.05] bg-[#FAF9F6] px-3.5 py-2.5 text-[11.5px] leading-snug text-muted">Your own keys pay for the models directly, on every board you own. They&apos;re stored encrypted and only used to run your agents.</p>
      <div className="divide-y divide-black/[0.05]">
        {providers.map((p) => (
          <KeyRow key={p.id} p={p} last4={mine?.find((k) => k.provider === p.id)?.last4} />
        ))}
      </div>
    </div>
  );
}

function KeyRow({ p, last4 }: { p: ProviderRow; last4?: string }) {
  const save = useMutation(api.models.saveKey);
  const remove = useMutation(api.models.removeKey);
  const [key, setKey] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const run = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await f();
      setKey("");
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof ConvexError ? String(e.data) : "Couldn't save it");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <Badge provider={p.id} size={26} />
      <span className="w-[92px] shrink-0">
        <span className="block text-[12.5px] font-semibold text-ink">{p.name}</span>
        <span className={`block text-[11px] ${last4 ? "text-[#0E8A47]" : p.pompi ? "text-muted" : "text-[#A86B00]"}`}>{last4 ? "Your key" : p.pompi ? "Included" : "Needs a key"}</span>
      </span>
      {last4 ? (
        <>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate font-mono text-[12px] text-ink-2">
            <Check className="size-3.5 shrink-0 text-[#0E8A47]" /> ••••{last4}
          </span>
          <button type="button" disabled={busy} onClick={() => void run(() => remove({ provider: p.id }), `${p.name} key removed`)} className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-[#FFF0F0] hover:text-[#E5484D]" aria-label={`Remove your ${p.name} key`}>
            {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          </button>
        </>
      ) : (
        <>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && key.trim()) {
                e.preventDefault();
                void run(() => save({ provider: p.id, key }), `${p.name} key saved`);
              }
            }}
            placeholder={p.pompi ? `Optional · ${p.keyHint}` : p.keyHint}
            autoComplete="off"
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-white px-2.5 font-mono text-[12px] outline-none placeholder:font-sans placeholder:text-black/35 focus:border-black/25 focus:ring-4 focus:ring-black/[0.04]"
          />
          {key.trim() ? (
            <button type="button" disabled={busy} onClick={() => void run(() => save({ provider: p.id, key }), `${p.name} key saved`)} className="flex h-8 items-center gap-1 rounded-full bg-ink px-3 text-[12px] font-semibold text-white hover:bg-black disabled:opacity-60">
              {busy ? <LoaderCircle className="size-3 animate-spin" /> : null} Save
            </button>
          ) : (
            <a href={p.keysUrl} target="_blank" rel="noreferrer" className="flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-semibold text-muted hover:bg-black/[0.05] hover:text-ink" title={`Get a ${p.name} key`}>
              Get one <ExternalLink className="size-3" />
            </a>
          )}
        </>
      )}
    </div>
  );
}
