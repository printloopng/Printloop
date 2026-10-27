import type { Metadata } from "next";
import { UserDetail } from "./UserDetail";

export const metadata: Metadata = { title: "Person" };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserDetail id={id} />;
}
