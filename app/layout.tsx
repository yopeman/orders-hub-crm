import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orders Hub CRM",
  description: "Track every Orders Hub prospect through the customer life cycle",
};

// Runs before paint so the saved theme is applied without a flash.
const themeScript = `
try {
  var t = localStorage.getItem('oh-theme') || 'system';
  document.documentElement.setAttribute('data-theme', t);
} catch (e) {
  document.documentElement.setAttribute('data-theme', 'system');
}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="system" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
