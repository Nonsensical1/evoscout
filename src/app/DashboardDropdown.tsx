"use client";

import { useState, useRef } from 'react';
import Link from 'next/link';

export function DashboardDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  const handleToggle = (e: React.MouseEvent) => {
    if (window.innerWidth <= 768) {
      if (!isOpen) {
        e.preventDefault(); 
        setIsOpen(true);
      } else {
        // Allow navigation to "/" if already open
      }
    }
  };

  const closeDropdown = () => {
    setIsOpen(false);
  };

  return (
    <div 
      className="relative flex items-center h-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Link 
        href="/" 
        className="hover-underline py-2"
        onClick={handleToggle}
      >
        Dashboard
      </Link>
      
      {isOpen && (
        <div className="absolute left-0 top-[100%] pt-2 w-40 z-[60]">
          <div className="flex flex-col bg-white dark:bg-[#121212] border border-editorial-border shadow-[4px_4px_0px_#e5e5e5] dark:shadow-[4px_4px_0px_#111111] text-left text-[10px] animate-in fade-in duration-200 uppercase tracking-widest font-sans font-bold">
            <Link href="/#section-news" onClick={closeDropdown} className="px-4 py-3 hover:bg-[#005587] dark:hover:bg-[#2563eb] hover:text-white border-b border-gray-100 dark:border-[#262626] last:border-0 whitespace-nowrap block transition-colors">Industry News</Link>
            <Link href="/#section-literature" onClick={closeDropdown} className="px-4 py-3 hover:bg-[#005587] dark:hover:bg-[#2563eb] hover:text-white border-b border-gray-100 dark:border-[#262626] last:border-0 whitespace-nowrap block transition-colors">Literature</Link>
            <Link href="/#section-history" onClick={closeDropdown} className="px-4 py-3 hover:bg-[#005587] dark:hover:bg-[#2563eb] hover:text-white border-b border-gray-100 dark:border-[#262626] last:border-0 whitespace-nowrap block transition-colors">History</Link>
            <Link href="/#section-grants" onClick={closeDropdown} className="px-4 py-3 hover:bg-[#005587] dark:hover:bg-[#2563eb] hover:text-white border-b border-gray-100 dark:border-[#262626] last:border-0 whitespace-nowrap block transition-colors">Funding Specs</Link>
            <Link href="/#section-open-grants" onClick={closeDropdown} className="px-4 py-3 hover:bg-[#005587] dark:hover:bg-[#2563eb] hover:text-white border-b border-gray-100 dark:border-[#262626] last:border-0 whitespace-nowrap block transition-colors">Active Postings</Link>
            <Link href="/#section-positions" onClick={closeDropdown} className="px-4 py-3 hover:bg-[#005587] dark:hover:bg-[#2563eb] hover:text-white border-b border-gray-100 dark:border-[#262626] last:border-0 whitespace-nowrap block transition-colors">Classifieds</Link>
          </div>
        </div>
      )}
    </div>
  );
}
