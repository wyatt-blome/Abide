import type { Metadata } from "next";
import { HowToAdd } from "@/components/library/HowToAdd";

export const metadata: Metadata = { title: "How to add a pack" };

export default function HowToAddPage() {
  return <HowToAdd />;
}
