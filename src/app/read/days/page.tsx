import type { Metadata } from "next";
import { DaysScreen } from "@/components/reader/DaysScreen";

export const metadata: Metadata = { title: "All days" };

export default function DaysPage() {
  return <DaysScreen />;
}
