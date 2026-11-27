"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Check, ChevronDown, ExternalLink, KeyRound, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Which model an agent thinks with (convex/models.ts): any of the providers this
 * Pompi pays for, or that the board's owner added their own key for.
 */
export function ModelPicker({ boardId, value, onChange }: { boardId: Id<"boards">; value: string; onChange: (ref: string) => void }) {
  const o = useQuery(api.models.options, { boardId });
  const [keys, setKeys] = React.useState(false);
  if (!o) return <div className="mt-1.5 h-11 animate-pulse rounded-xl bg-black/[0.04]" />;
  const byProvider = o.providers.map((p) => ({ ...p, models: o.models.filter((m) => m.provider === p.id) }));
  const chosen = o.models.find((m) => m.ref === value);
  const fallback = o.models.find((m) => m.ref === o.default);
  const missing = chosen && !chosen.ready;

  return (
    <div>
      <div className="relative mt-1.5">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full appearance-none rounded-xl border border-line bg-white pr-9 pl-3.5 text-[14.5px] outline-none transition-all focus:border-black/25 focus:ring-4 focus:ring-black/[0.05]"
        >
          <option value="">Default{fallback ? ` (${fallback.name})` : ""}</option>
          {byProvider.map((p) => (
            <optgroup key={p.id} label={`${p.name}${p.pompi || p.own ? "" : " (add a key to use)"}`}>
              {p.models.map((m) => (
                <option key={m.ref} value={m.ref} disabled={!m.ready && m.ref !== value}>
                  {m.name} · {m.blurb}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
      </div>
      <p className="mt-1.5 flex items-center justify-between gap-2 text-[11.5px] text-muted">
        <span className={missing ? "text-[#A86B00]" : ""}>
          {missing ? `No ${o.providers.find((p) => p.id === chosen.provider)?.name} key: it uses the default until one's added.` : chosen && !chosen.vision ? "This one can't see the screen: it reads web pages as text and works in the terminal." : "Any model can use the web, apps and the computer."}
        </span>
        {o.isOwner ? (
          <button type="button" onClick={() => setKeys((k) => !k)} className="flex shrink-0 items-center gap-1 font-semibold text-ink-2 hover:text-ink">
            <KeyRound className="size-3" /> {keys ? "Hide keys" : "Your API keys"}
          </button>
        ) : null}
      </p>
      {keys && o.isOwner ? <ApiKeys providers={o.providers} /> : null}
    </div>
  );
}

type ProviderRow = { id: string; name: string; keyHint: string; keysUrl: string; pompi: boolean; own: boolean };

/** The owner's own keys, one per provider. The agents on boards they own use them. */
function ApiKeys({ providers }: { providers: ProviderRow[] }) {
  const mine = useQuery(api.models.myKeys);
  return (
    <div className="mt-2 space-y-2 rounded-2xl bg-[#FAF9F6] p-3 ring-1 ring-black/[0.06]">
      <p className="text-[11.5px] leading-snug text-muted">Your own keys pay for the models directly, on every board you own. They&apos;re stored encrypted and only used to run your agents.</p>
      {providers.map((p) => (
        <KeyRow key={p.id} p={p} last4={mine?.find((k) => k.provider === p.id)?.last4} />
      ))}
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
    <div className="flex items-center gap-2">
      <span className="w-[86px] shrink-0 text-[12.5px] font-semibold text-ink-2">{p.name}</span>
      {last4 ? (
        <>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate font-mono text-[12px] text-ink-2">
            <Check className="size-3.5 shrink-0 text-[#0E8A47]" /> ••••{last4}
          </span>
          <button type="button" disabled={busy} onClick={() => void run(() => remove({ provider: p.id }), `${p.name} key removed`)} className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-black/[0.05] hover:text-[#E5484D]" aria-label={`Remove your ${p.name} key`}>
            {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          </button>
        </>
      ) : (
        <>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={p.pompi ? `Included · or your own ${p.keyHint}` : p.keyHint}
            autoComplete="off"
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-white px-2.5 font-mono text-[12px] outline-none placeholder:font-sans placeholder:text-black/35 focus:border-black/25"
          />
          {key.trim() ? (
            <button type="button" disabled={busy} onClick={() => void run(() => save({ provider: p.id, key }), `${p.name} key saved`)} className="flex h-8 items-center gap-1 rounded-full bg-ink px-3 text-[12px] font-semibold text-white hover:bg-black disabled:opacity-60">
              {busy ? <LoaderCircle className="size-3 animate-spin" /> : null} Save
            </button>
          ) : (
            <a href={p.keysUrl} target="_blank" rel="noreferrer" className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-black/[0.05] hover:text-ink" aria-label={`Get a ${p.name} key`} title={`Get a ${p.name} key`}>
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </>
      )}
    </div>
  );
}
