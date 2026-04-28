import { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import './globals.css';
import { ReactNode } from 'react';
import Link from 'next/link';
import { AppProviders } from './providers';
import { UserMenu } from './UserMenu';
import { CurrentDate } from './CurrentDate';
import { DashboardDropdown } from './DashboardDropdown';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-serif' });

export const metadata: Metadata = {
  title: 'EvoScout | The Blueprint for Synthetic Biology',
  description: 'Automated 24-hour scouting dashboard for grants, jobs, and key literature in Synthetic Biology.',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable} antialiased`} suppressHydrationWarning>
      <body className="bg-editorial-bg text-editorial-text min-h-screen selection:bg-gray-200 transition-colors duration-300">
        <AppProviders>
          {/* Masthead */}
          <header className="bg-editorial-paper border-b border-editorial-border-dark sticky top-0 z-50 shadow-sm transition-all duration-300">
            <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col items-center border-b border-editorial-border pb-4 relative">
               <div className="w-full flex justify-between items-center text-[10px] md:text-xs font-sans text-editorial-muted uppercase tracking-widest mb-4">
                  <CurrentDate />
                  <span>Synthetic Biology Edition</span>
               </div>
               <Link href="/" className="hover:opacity-80 transition-opacity">
                 <h1 className="text-5xl md:text-7xl font-serif font-black tracking-tighter text-editorial-text py-2 italic pr-4">
                   The EvoScout
                 </h1>
               </Link>
            </div>
            <nav className="max-w-7xl mx-auto px-6 h-12 flex items-center justify-center gap-10 text-[11px] md:text-xs font-sans font-bold text-editorial-text uppercase tracking-widest relative">
               <DashboardDropdown />
               <Link href="/history" className="hover-underline">Ledger</Link>
               <Link href="/settings" className="hover-underline">Settings</Link>
               <UserMenu />
            </nav>
          </header>

          <main className="py-12 px-6 max-w-7xl mx-auto bg-editorial-paper shadow-sm min-h-screen my-8 border border-editorial-border relative">
            {children}
          </main>

          <footer className="text-center py-10 font-sans text-xs text-editorial-muted uppercase tracking-widest border-t border-editorial-border-dark bg-editorial-paper flex flex-col items-center gap-4">
            <p>
              © {new Date().getFullYear()} The EvoScout Company. All Rights Reserved.
            </p>
            <div className="flex flex-col items-center gap-3 normal-case tracking-normal opacity-90 mt-2">
              <span className="text-base">Made with ❤️</span>
              <a href="mailto:elijahryal@outlook.com" className="text-base font-bold hover:text-editorial-text transition-colors border border-editorial-border px-5 py-2.5 rounded-full hover:bg-gray-50 dark:hover:bg-[#1a1a1a] flex items-center gap-2 shadow-sm">
                <span className="text-lg">☕</span> Buy me a coffee
              </a>
            </div>
          </footer>
        </AppProviders>
      </body>
    </html>
  );
}
