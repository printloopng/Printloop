import type { Metadata } from "next";
import { getCurrentUser } from "@printloop/auth/server";
import { HomeView } from "./HomeView";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const user = await getCurrentUser();
  return <HomeView firstName={user?.firstName ?? ""} />;
}
