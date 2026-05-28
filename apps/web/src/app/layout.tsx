import type { Metadata, Viewport } from 'next';
import './global.css';
import { Providers } from '../lib/providers';
import { NavBar } from '../components/layout/NavBar';
import { AIFloatingButton, AISidebarDrawer } from '../components/layout/AIDrawer';

export const metadata: Metadata = {
  title: {
    default: 'TechStore — Premium Tech Gear',
    template: '%s | TechStore',
  },
  description: 'Discover premium tech gear: headphones, keyboards, monitors, and more. Powered by a federated GraphQL ecosystem with AI-assisted shopping.',
  keywords: ['tech', 'electronics', 'e-commerce', 'headphones', 'keyboards'],
  authors: [{ name: 'TechStore Team' }],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#050914',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <NavBar />
          <div className="page-wrapper">
            {children}
          </div>
          <AIFloatingButton />
          <AISidebarDrawer />
        </Providers>
      </body>
    </html>
  );
}
