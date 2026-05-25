import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EV Route Optimizer | Modified A* Battery-Aware Routing',
  description:
    'Energy- and battery-health-aware EV routing with predictive maintenance using Modified A*, spectral clustering, and fuzzy reinforcement learning.',
  keywords: ['EV routing', 'battery health', 'A* algorithm', 'predictive maintenance', 'electric vehicle'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
