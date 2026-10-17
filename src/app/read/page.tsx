import type { Metadata } from "next";
import { ReadScreen } from "@/components/reader/ReadScreen";

export const metadata: Metadata = { title: "Read" };

export default function ReadPage() {
  return <ReadScreen />;
}
