"use client";

import { useState, useEffect } from 'react';

export function CurrentDate() {
  const [dateStr, setDateStr] = useState<string>('');

  useEffect(() => {
    // Evaluation on the client to get the user's local, current date
    const now = new Date();
    setDateStr(now.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }));
  }, []);

  // Return an empty span or a placeholder during hydration to prevent mismatch
  return <span className="min-w-[150px]">{dateStr || '...'}</span>;
}
