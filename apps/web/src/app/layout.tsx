import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conversational SMS Admin",
  description: "Admin interface for the conversational SMS system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
