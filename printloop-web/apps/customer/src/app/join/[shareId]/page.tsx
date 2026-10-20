import type { Metadata } from "next";
import { getCurrentUser, serverApi } from "@printloop/auth/server";
import { EmptyState } from "@printloop/ui";
import { PublicShell } from "@/components/PublicShell";
import { JoinFlow } from "./JoinFlow";

export const metadata: Metadata = { title: "Join a group print" };

async function loadSession(shareId: string) {
  try {
    const api = await serverApi({ auth: false });
    const { data } = await api.GET("/groups/share/{shareId}", { params: { path: { shareId } } });
    return data?.data?.session ?? null;
  } catch {
    return null;
  }
}

export default async function JoinPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const [session, user] = await Promise.all([loadSession(shareId), getCurrentUser()]);
  return (
    <PublicShell signedIn={Boolean(user)}>
      <div className="max-w-2xl mx-auto">
        {session ? (
          <JoinFlow
            shareId={shareId}
            session={{ groupName: session.groupName, deadline: session.deadline, defaultOptions: session.defaultOptions ?? {} }}
            prefill={user ? { name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(), email: user.email } : null}
          />
        ) : (
          <EmptyState title="This group isn't taking uploads" description="The link may be wrong, or the organiser already closed it. Ask them for a new link." />
        )}
      </div>
    </PublicShell>
  );
}
