import type { Metadata } from "next";
import { AppNav } from "../components/AppNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conversational SMS",
  description: "Admin interface and dev handset for the conversational SMS system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppNav />
        {children}
      </body>
    </html>
  );
}
