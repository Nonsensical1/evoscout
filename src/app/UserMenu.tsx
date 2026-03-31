"use client";

import { useAuth } from '@/app/providers';

export function UserMenu() {
  const { user, signOut } = useAuth();

  if (!user) return null;

  return (
    <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center">
      <button 
        onClick={signOut}
        className="flex items-center gap-2 group hover:opacity-80 transition-opacity"
        title="Sign Out"
      >
        <span className="hidden sm:inline-block text-[10px] md:text-[11px] uppercase font-sans font-bold tracking-widest text-[#b02a2a] group-hover:underline">Sign Out</span>
        {user.photoURL ? (
          <img 
            src={user.photoURL} 
            alt="Profile" 
            className="w-7 h-7 rounded-full border border-editorial-border-dark grayscale group-hover:grayscale-0 transition-all object-cover"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-editorial-border-dark flex items-center justify-center text-white text-[10px]">
            {user.email?.charAt(0).toUpperCase()}
          </div>
        )}
      </button>
    </div>
  );
}
