import type { Metadata } from "next";
import { CatalogueView } from "./CatalogueView";

export const metadata: Metadata = { title: "Prices & promos" };

export default function CataloguePage() {
  return <CatalogueView />;
}
