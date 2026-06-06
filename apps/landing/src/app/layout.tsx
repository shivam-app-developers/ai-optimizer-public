import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ai-optimizer — cut your coding agent token bill',
  description:
    'MCP server that gives Claude Code, Cursor, and other AI coding agents framework-aware context. Open-source engine, paid framework packs.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
