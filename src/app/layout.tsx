import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Apex Morning Trading Desk",
  description: "Decision-support desk: morning slate, journal, scores, playbook.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="top">
          <span className="brand">📈 Apex Desk</span>
          <a href="/">Slate</a>
          <a href="/journal">Journal</a>
          <a href="/scores">Scores</a>
          <a href="/playbook">Playbook</a>
        </nav>
        <div className="wrap">{children}</div>
      </body>
    </html>
  );
}
