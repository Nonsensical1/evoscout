"use client";

import { useState, useEffect } from 'react';
import { ExternalLink, History } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/app/providers';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

export default function LedgerPage() {
  const { user } = useAuth();
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    const q = query(collection(db, 'users', user.uid, 'ledger'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const historyItems = snapshot.docs.map(doc => doc.data());
      setLedger(historyItems);
      setLoading(false);
    });
    
    return () => unsub();
  }, [user]);

  if (!user || loading) return <div className="min-h-[50vh] flex items-center justify-center font-serif text-xl italic text-editorial-muted">Retrieving authenticated archives...</div>;

  return (
    <div className="animate-in fade-in duration-700">
      <section className="mb-10 border-b-2 border-editorial-border-dark pb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="space-y-2">
            <h2 className="text-4xl font-serif font-black tracking-tighter text-editorial-text uppercase mt-2 text-center md:text-left">Historical Ledger</h2>
            <p className="font-sans text-editorial-muted max-w-2xl text-base text-center md:text-left">
              The official archive of previously scouted editions. Items indexed here structurally inform the Novelty Constraint engine to filter duplicates.
            </p>
          </div>
        </div>
      </section>

      {ledger.length === 0 ? (
        <div className="text-center py-20 font-serif italic text-editorial-muted border border-dashed border-gray-300 dark:border-[#404040] bg-gray-50 dark:bg-[#1e1e1e]">
           No historical editions found in the ledger.
        </div>
      ) : (
        <div className="flex flex-col gap-16">
          {ledger.map((edition, idx) => (
             <div key={idx} className="border border-editorial-border bg-editorial-paper p-8 shadow-[4px_4px_0px_#e5e5e5] dark:shadow-[4px_4px_0px_#111111]">
                <div className="border-b-[3px] border-editorial-border-dark mb-6 pb-2 flex justify-between items-baseline">
                   <h3 className="text-2xl font-serif font-bold tracking-tight">Edition: {edition.date}</h3>
                   <span className="text-xs font-sans font-bold uppercase tracking-widest text-editorial-muted">
                     {(edition.grants?.length || 0) + (edition.news?.length || 0) + (edition.literature?.length || 0) + (edition.positions?.length || 0)} Items
                   </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                   {/* Col 1 */}
                   <div className="flex flex-col gap-4 border-r-0 md:border-r border-editorial-border pr-0 md:pr-6">
                      <h4 className="text-sm font-sans font-bold uppercase tracking-widest mb-2 border-b border-gray-200 dark:border-[#333333] pb-1">Funding</h4>
                      {!edition.grants || edition.grants.length === 0 ? <p className="text-xs italic text-gray-500 dark:text-gray-400">None</p> : edition.grants.map((g: any, i: number) => (
                         <a href={g.url} target="_blank" rel="noopener noreferrer" key={i} className="group block mb-3 border-b border-gray-100 dark:border-[#262626] pb-3 last:border-0 hover:bg-gray-50 dark:hover:bg-[#262626] transition-colors -mx-2 px-2">
                           <h5 className="font-serif font-bold leading-tight group-hover:underline decoration-1 underline-offset-2">{g.title}</h5>
                           <div className="flex justify-between items-center text-xs mt-1">
                              <span className="text-[#005587] dark:text-[#60a5fa] font-bold">{g.agency}</span>
                              <span className="text-gray-500 dark:text-gray-400 font-mono">{g.amount}</span>
                           </div>
                         </a>
                      ))}
                   </div>

                   {/* Col 2 */}
                   <div className="flex flex-col gap-4 border-r-0 md:border-r border-editorial-border pr-0 md:pr-6">
                      <h4 className="text-sm font-sans font-bold uppercase tracking-widest mb-2 border-b border-gray-200 dark:border-[#333333] pb-1">Literature & Pre-Prints</h4>
                      {!edition.literature || edition.literature.length === 0 ? <p className="text-xs italic text-gray-500 dark:text-gray-400">None</p> : edition.literature.map((l: any, i: number) => (
                         <a href={`https://doi.org/${l.doi}`} target="_blank" rel="noopener noreferrer" key={i} className="group mb-3 border-b border-gray-100 dark:border-[#262626] pb-3 last:border-0 hover:bg-gray-50 dark:hover:bg-[#262626] transition-colors p-2 -mx-2 block">
                           <h5 className="font-serif font-bold leading-tight group-hover:underline">{l.title}</h5>
                           <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-1">{l.authors}</p>
                           <span className="text-[10px] uppercase font-bold text-gray-400 mt-1 block">{l.journal}</span>
                         </a>
                      ))}
                   </div>
                   
                   {/* Col 3 */}
                   <div className="flex flex-col gap-4">
                      <h4 className="text-sm font-sans font-bold uppercase tracking-widest mb-2 border-b border-gray-200 dark:border-[#333333] pb-1">Positions & News</h4>
                      {!edition.positions || edition.positions.length === 0 ? null : edition.positions.map((p: any, i: number) => (
                         <a href={p.url} target="_blank" rel="noopener noreferrer" key={`p-${i}`} className="group block mb-4 border-b border-dashed border-gray-100 dark:border-[#262626] pb-4 last:border-0 hover:bg-gray-50 dark:hover:bg-[#262626] transition-colors p-2 -mx-2">
                           <h5 className="font-serif text-sm font-bold text-[#b02a2a] dark:text-[#f87171] group-hover:underline">{p.title}</h5>
                           <span className="text-[10px] uppercase font-bold text-gray-400">{p.institution}</span>
                         </a>
                      ))}
                      {!edition.news || edition.news.length === 0 ? null : edition.news.map((n: any, i: number) => (
                         <a href={n.url || "#"} target="_blank" key={`n-${i}`} className="block mt-4 pt-4 border-t border-dashed border-gray-200 dark:border-[#333333] hover:opacity-80 transition-opacity">
                           <span className="text-[10px] uppercase font-bold text-[#005587] dark:text-[#60a5fa] block mb-1">News Alert</span>
                           <h5 className="font-serif text-sm font-bold group-hover:underline">{n.title}</h5>
                         </a>
                      ))}
                   </div>
                </div>
             </div>
          ))}
        </div>
      )}
    </div>
  );
}
