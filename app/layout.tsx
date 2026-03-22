import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Planit — Your Adaptive AI Travel Sidekick",
  description:
    "An AI-powered itinerary app that learns your preferences, provides branching real-time plans, and guides you with voice.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
