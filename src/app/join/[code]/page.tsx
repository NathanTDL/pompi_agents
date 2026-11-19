"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { FullPageSpinner, useSignedIn } from "@/lib/use-signed-in";

/** A share link: join the board, then open it. */
export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const signedIn = useSignedIn();
  const router = useRouter();
  const join = useMutation(api.boards.join);
  const [error, setError] = React.useState<string | null>(null);
  const tried = React.useRef(false);

  React.useEffect(() => {
    if (!signedIn || tried.current) return;
    tried.current = true;
    join({ code })
      .then((boardId) => router.replace(`/b/${boardId}`))
      .catch((e: unknown) => setError(e instanceof ConvexError ? String(e.data) : "Couldn't join this board."));
  }, [signedIn, join, code, router]);

  if (!error) return <FullPageSpinner />;
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6 text-center">
      <div>
        <h1 className="text-xl font-bold">{error}</h1>
        <p className="mt-2 text-sm text-black/60">Ask whoever shared it for a new link.</p>
        <Link href="/app" className="mt-5 inline-block rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white">
          Go to your boards
        </Link>
      </div>
    </div>
  );
}
