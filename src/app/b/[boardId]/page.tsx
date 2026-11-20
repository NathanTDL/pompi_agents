"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BoardCanvas } from "@/components/canvas/board-canvas";
import { FullPageSpinner, useSignedIn } from "@/lib/use-signed-in";

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const signedIn = useSignedIn();
  const id = boardId as Id<"boards">;
  const me = useQuery(api.users.me, signedIn ? {} : "skip");
  const board = useQuery(api.boards.get, signedIn ? { boardId: id } : "skip");
  const opened = useMutation(api.boards.opened);

  React.useEffect(() => {
    if (board) void opened({ boardId: id }).catch(() => {});
    // Once per visit, when the board first loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!board, id]);

  React.useEffect(() => {
    if (board?.name) document.title = `${board.name} — Pompi`;
  }, [board?.name]);

  if (!signedIn || me === undefined || board === undefined) return <FullPageSpinner />;
  if (!me || !board) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-6 text-center">
        <div>
          <h1 className="text-xl font-bold">This board isn&apos;t here</h1>
          <p className="mt-2 text-sm text-black/60">It was deleted, or you haven&apos;t been invited to it. Ask its owner for the share link.</p>
          <Link href="/app" className="mt-5 inline-block rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white">
            Back to your boards
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-clip">
      <BoardCanvas boardId={id} me={me} />
    </div>
  );
}
