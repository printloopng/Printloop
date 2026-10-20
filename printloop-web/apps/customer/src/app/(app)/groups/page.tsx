import type { Metadata } from "next";
import { PageHeader } from "@printloop/ui";
import { GroupsView } from "./GroupsView";

export const metadata: Metadata = { title: "Group printing" };

export default function GroupsPage() {
  return (
    <>
      <PageHeader
        kicker="Group printing"
        title={
          <>
            Collect the whole class, <em className="text-persimmon">print once</em>.
          </>
        }
        description="Share a link. Everyone uploads and pays for their own document. You collect the batch with one code."
      />
      <GroupsView />
    </>
  );
}
