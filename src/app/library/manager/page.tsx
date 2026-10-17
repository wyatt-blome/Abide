import type { Metadata } from "next";
import { LibraryManager } from "@/components/library/LibraryManager";

export const metadata: Metadata = { title: "Library manager" };

export default function LibraryManagerPage() {
  return <LibraryManager />;
}
