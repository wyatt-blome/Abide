import type { Metadata } from "next";
import { BooksScreen } from "@/components/reader/BooksScreen";

export const metadata: Metadata = { title: "Books" };

export default function BooksPage() {
  return <BooksScreen />;
}
