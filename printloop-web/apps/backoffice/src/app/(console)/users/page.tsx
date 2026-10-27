import type { Metadata } from "next";
import { UsersView } from "./UsersView";

export const metadata: Metadata = { title: "People" };

export default function UsersPage() {
  return <UsersView />;
}
