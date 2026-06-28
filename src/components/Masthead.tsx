"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardDropdown } from '@/app/DashboardDropdown';
import { UserMenu } from '@/app/UserMenu';
import { CurrentDate } from '@/app/CurrentDate';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Menu, X } from 'lucide-react';

export default function Masthead() {
  const router = useRouter();
  const [firstOClicked, setFirstOClicked] = useState(false);
  const [secondOClicked, setSecondOClicked] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const today = new Date().toDateString();
    const stored = localStorage.getItem('evoscout_secret_chess_date');
    if (stored === today) {
      setIsUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (firstOClicked && secondOClicked) {
      if (!isUnlocked) {
        setIsUnlocked(true);
        const today = new Date().toDateString();
        localStorage.setItem('evoscout_secret_chess_date', today);
      }
    }
  }, [firstOClicked, secondOClicked, isUnlocked]);

  const navigateHome = () => {
     router.push('/');
  }

  return (
    <header className="bg-editorial-paper border-b border-editorial-border-dark sticky top-0 z-50 shadow-sm transition-all duration-300">
      <div className="max-w-[1600px] mx-auto px-6 py-4 flex flex-col items-center border-b border-editorial-border pb-4 relative">
         <div className="w-full flex justify-between items-center text-[10px] md:text-xs font-sans text-editorial-muted uppercase tracking-widest mb-4">
            <CurrentDate />
            <span>Synthetic Biology Edition</span>
         </div>
         
         <div onClick={navigateHome} className="hover:opacity-80 transition-opacity cursor-pointer">
           <h1 className="text-5xl md:text-7xl font-serif font-black tracking-tighter text-editorial-text py-2 italic pr-4 select-none">
             The Ev<span role="button" onClick={(e) => { e.stopPropagation(); setFirstOClicked(true); }} className="cursor-pointer">o</span>Sc<span role="button" onClick={(e) => { e.stopPropagation(); setSecondOClicked(true); }} className="cursor-pointer">o</span>ut
           </h1>
         </div>
      </div>
      {isMobile ? (
         <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center justify-between">
           <div className="flex items-center gap-4">
             <DashboardDropdown />
           </div>
           <div className="flex items-center gap-4">
             <UserMenu />
             <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 -mr-2 text-editorial-text focus:outline-none">
               {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
             </button>
           </div>
         </div>
      ) : (
        <nav className="max-w-[1600px] mx-auto px-6 h-12 flex items-center justify-center gap-10 text-[11px] md:text-xs font-sans font-bold text-editorial-text uppercase tracking-widest relative">
           <DashboardDropdown />
           <Link href="/history" className="hover-underline">Ledger</Link>
           <Link href="/leaderboard" className="hover-underline">Leaderboard</Link>
           {isUnlocked && (
             <>
               <Link href="/chess" className="hover-underline">Chess</Link>
               <Link href="/surf" className="hover-underline">Surf</Link>
             </>
           )}
           <Link href="/settings" className="hover-underline">Settings</Link>
           <UserMenu />
        </nav>
      )}

      {/* Mobile Menu Dropdown */}
      {isMobile && menuOpen && (
        <nav className="bg-editorial-paper border-t border-editorial-border-dark flex flex-col items-center py-4 gap-4 text-sm font-sans font-bold text-editorial-text uppercase tracking-widest absolute w-full left-0 shadow-md">
           <Link href="/history" onClick={() => setMenuOpen(false)} className="w-full text-center py-2 hover:bg-gray-100 dark:hover:bg-[#333]">Ledger</Link>
           <Link href="/leaderboard" onClick={() => setMenuOpen(false)} className="w-full text-center py-2 hover:bg-gray-100 dark:hover:bg-[#333]">Leaderboard</Link>
           {isUnlocked && (
             <>
               <Link href="/chess" onClick={() => setMenuOpen(false)} className="w-full text-center py-2 hover:bg-gray-100 dark:hover:bg-[#333]">Chess</Link>
               <Link href="/surf" onClick={() => setMenuOpen(false)} className="w-full text-center py-2 hover:bg-gray-100 dark:hover:bg-[#333]">Surf</Link>
             </>
           )}
           <Link href="/settings" onClick={() => setMenuOpen(false)} className="w-full text-center py-2 hover:bg-gray-100 dark:hover:bg-[#333]">Settings</Link>
        </nav>
      )}
    </header>
  );
}
