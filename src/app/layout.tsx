import { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import './globals.css';
import { ReactNode } from 'react';
import Link from 'next/link';
import { AppProviders } from './providers';
import { UserMenu } from './UserMenu';
import { CurrentDate } from './CurrentDate';
import { DashboardDropdown } from './DashboardDropdown';
import { Mail } from 'lucide-react';


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
            <div className="flex flex-col items-center gap-4 normal-case tracking-normal opacity-90 mt-2">
              <span className="text-base">Made with ❤️</span>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <a href="mailto:elijahryal@outlook.com" className="text-sm font-bold hover:text-editorial-text transition-colors border border-editorial-border px-5 py-2.5 rounded-full hover:bg-gray-50 dark:hover:bg-[#1a1a1a] flex items-center gap-2 shadow-sm">
                  <Mail className="w-4 h-4" /> Email
                </a>
                <a href="https://buymeacoffee.com/elistewart" target="_blank" rel="noopener noreferrer" className="text-sm font-bold hover:text-editorial-text transition-colors border border-editorial-border px-5 py-2.5 rounded-full hover:bg-gray-50 dark:hover:bg-[#1a1a1a] flex items-center gap-2 shadow-sm">
                  <span className="text-lg">☕</span> Buy me a coffee
                </a>
                <a href="https://github.com/Nonsensical1" target="_blank" rel="noopener noreferrer" className="text-sm font-bold hover:text-editorial-text transition-colors border border-editorial-border px-5 py-2.5 rounded-full hover:bg-gray-50 dark:hover:bg-[#1a1a1a] flex items-center gap-2 shadow-sm">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg> GitHub
                </a>
              </div>
            </div>
          </footer>
        </AppProviders>
      </body>
    </html>
  );
}
