"use client";

import "@univerjs/preset-docs-core/lib/index.css";
import { useEffect, useEffectEvent, useRef } from "react";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import { UniverDocsCorePreset } from "@univerjs/preset-docs-core";
import UniverPresetDocsCoreEnUS from "@univerjs/preset-docs-core/locales/en-US";
import { io, type Socket } from "socket.io-client";
import { ApiError } from "@printloop/api-client";
import { useApiClient, useApiContext } from "@printloop/api-client/react";

export interface SaveState {
  status: "idle" | "saving" | "saved" | "error";
  at: number | null;
  version: number;
  message?: string;
}

const MUTATIONS = /^doc\.(mutation|command)\./;

export default function UniverCanvas({
  sessionId,
  document,
  initialVersion,
  token,
  socketPath,
  readOnly,
  onSaveState,
  onPeer,
}: {
  sessionId: string;
  document: Record<string, unknown>;
  initialVersion: number;
  token: string | null;
  socketPath: string;
  readOnly: boolean;
  onSaveState: (s: SaveState) => void;
  onPeer: (here: boolean) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const client = useApiClient();
  const { apiOrigin } = useApiContext();
  const reportSave = useEffectEvent(onSaveState);
  const reportPeer = useEffectEvent(onPeer);
  const persist = useEffectEvent(async (doc: Record<string, unknown>, version: number) => {
    const res = await client.POST("/saas/editor/session/{id}/snapshot", { params: { path: { id: sessionId } }, body: { document: doc, version } });
    return res.data?.data?.version ?? version + 1;
  });

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const { univer, univerAPI } = createUniver({
      locale: LocaleType.EN_US,
      locales: { [LocaleType.EN_US]: mergeLocales(UniverPresetDocsCoreEnUS) },
      presets: [UniverDocsCorePreset({ container: el, header: !readOnly, toolbar: !readOnly })],
    });
    const fdoc = univerAPI.createDocument(document);
    if (readOnly) {
      try {
        fdoc.getPermission().setReadOnly?.(true);
      } catch {
        void 0;
      }
    }

    let socket: Socket | null = null;
    if (token) {
      socket = io(apiOrigin, { path: socketPath, transports: ["websocket"], auth: { token } });
      socket.on("room-state", (s: { peerConnected?: boolean }) => reportPeer(Boolean(s.peerConnected)));
      socket.on("peer-joined", () => reportPeer(true));
      socket.on("peer-left", () => reportPeer(false));
    }

    let version = initialVersion;
    let dirty = false;
    let saving = false;
    let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;

    const save = async () => {
      if (!dirty || saving) return;
      saving = true;
      dirty = false;
      reportSave({ status: "saving", at: null, version });
      try {
        version = await persist(fdoc.save() as unknown as Record<string, unknown>, version);
        reportSave({ status: "saved", at: Date.now(), version });
      } catch (err) {
        dirty = true;
        const conflict = err instanceof ApiError && err.code === "VERSION_CONFLICT";
        reportSave({ status: "error", at: null, version, message: conflict ? "Edited elsewhere. Reload to continue." : "Couldn't save. Retrying…" });
        if (!conflict) saveTimer = setTimeout(save, 5000);
      } finally {
        saving = false;
      }
    };

    const sub = readOnly
      ? null
      : univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event: { id?: string }) => {
          if (!event?.id || !MUTATIONS.test(event.id)) return;
          dirty = true;
          if (broadcastTimer) clearTimeout(broadcastTimer);
          broadcastTimer = setTimeout(() => socket?.emit("snapshot", { snapshot: fdoc.save(), version: version + 1 }), 400);
          if (saveTimer) clearTimeout(saveTimer);
          saveTimer = setTimeout(save, 2000);
        });

    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);

    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      if (broadcastTimer) clearTimeout(broadcastTimer);
      if (saveTimer) clearTimeout(saveTimer);
      if (dirty) void save();
      sub?.dispose();
      socket?.disconnect();
      univer.dispose();
    };
  }, [sessionId, document, initialVersion, token, socketPath, readOnly, apiOrigin]);

  return <div ref={container} className="h-[70vh] w-full border-2 border-ink bg-white overflow-hidden" />;
}
