import type { Metadata } from "next";
import { NoteSearch } from "@/components/library/NoteSearch";

export const metadata: Metadata = { title: "Search notes by verse" };

export default function LibrarySearchPage() {
  return <NoteSearch />;
}
