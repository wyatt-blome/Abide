import type { Metadata } from "next";
import { MyLibrary } from "@/components/library/MyLibrary";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return <MyLibrary />;
}
