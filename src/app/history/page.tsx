"use client";

import { useState, useEffect, useMemo } from 'react';
import { ExternalLink, History, Search, Filter } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/app/providers';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

export default function LedgerPage() {
  const { user } = useAuth();
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    institution: "",
    name: "",
    source: "",
    author: "",
    showPreprints: true,
    showGrants: true,
    showNews: true,
    showCareers: true,
  });

  const filteredLedger = useMemo(() => {
    return ledger.map(edition => {
      // Date filter on the entire edition
      if (filters.dateFrom || filters.dateTo) {
         const edDate = new Date(edition.date);
         if (!isNaN(edDate.getTime())) {
            if (filters.dateFrom && edDate < new Date(filters.dateFrom)) return null;
            if (filters.dateTo && edDate > new Date(filters.dateTo)) return null;
         }
      }

      // Extract text filters
      const qName = filters.name.toLowerCase().trim();
      const qInst = filters.institution.toLowerCase().trim();
      const qSource = filters.source.toLowerCase().trim();
      const qAuthor = filters.author.toLowerCase().trim();
      const qGlobal = searchQuery.toLowerCase().trim();

      const globalMatch = (item: any) => {
         if (!qGlobal) return true;
         return Object.values(item).some(val => 
           typeof val === 'string' && val.toLowerCase().includes(qGlobal)
         );
      };

      const filterGrants = (items: any[]) => {
         if (!filters.showGrants) return [];
         return (items || []).filter(item => {
            if (qName && !item.title?.toLowerCase().includes(qName)) return false;
            if (qSource && !item.agency?.toLowerCase().includes(qSource)) return false;
            if (qInst) return false;
            if (qAuthor) return false;
            return globalMatch(item);
         });
      };

      const filterLit = (items: any[]) => {
         if (!filters.showPreprints) return [];
         return (items || []).filter(item => {
            if (qName && !item.title?.toLowerCase().includes(qName)) return false;
            if (qSource && !item.journal?.toLowerCase().includes(qSource)) return false;
            if (qAuthor && !item.authors?.toLowerCase().includes(qAuthor)) return false;
            if (qInst) return false;
            return globalMatch(item);
         });
      };

      const filterPos = (items: any[]) => {
         if (!filters.showCareers) return [];
         return (items || []).filter(item => {
            if (qName && !item.title?.toLowerCase().includes(qName)) return false;
            if (qInst && !item.institution?.toLowerCase().includes(qInst)) return false;
            if (qSource) return false;
            if (qAuthor) return false;
            return globalMatch(item);
         });
      };

      const filterNews = (items: any[]) => {
         if (!filters.showNews) return [];
         return (items || []).filter(item => {
            if (qName && !item.title?.toLowerCase().includes(qName)) return false;
            if (qSource && !item.url?.toLowerCase().includes(qSource) && !item.source?.toLowerCase().includes(qSource)) return false;
            if (qInst) return false; 
            if (qAuthor) return false;
            return globalMatch(item);
         });
      };

      const matchingGrants = filterGrants(edition.grants);
      const matchingLit = filterLit(edition.literature);
      const matchingPos = filterPos(edition.positions);
      const matchingNews = filterNews(edition.news);

      const hasSpecificFilters = qName || qInst || qSource || qAuthor;
      const matchDate = !hasSpecificFilters && qGlobal && edition.date?.toLowerCase().includes(qGlobal);

      if (matchDate) {
         return {
            ...edition,
            grants: filters.showGrants ? edition.grants : [],
            literature: filters.showPreprints ? edition.literature : [],
            positions: filters.showCareers ? edition.positions : [],
            news: filters.showNews ? edition.news : []
         };
      }

      const hasMatches = matchingGrants.length > 0 || matchingLit.length > 0 || matchingPos.length > 0 || matchingNews.length > 0;
      const noTextFilters = !hasSpecificFilters && !qGlobal;
      
      return hasMatches || (noTextFilters && ((edition.grants?.length || 0) + (edition.literature?.length || 0) + (edition.positions?.length || 0) + (edition.news?.length || 0) === 0)) ? {
        ...edition,
        grants: matchingGrants,
        literature: matchingLit,
        positions: matchingPos,
        news: matchingNews
      } : null;
    }).filter(Boolean);
  }, [ledger, searchQuery, filters]);

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
          <div className="w-full md:w-auto relative flex items-center gap-2">
             <div className="relative w-full md:w-64">
               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
               </div>
               <input
                 type="text"
                 placeholder="Search archives globally..."
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full pl-10 pr-4 py-2 border border-editorial-border bg-editorial-paper focus:outline-none focus:ring-1 focus:ring-editorial-border-dark font-sans text-sm dark:bg-[#1e1e1e]"
               />
             </div>
             <button
               onClick={() => setShowFilters(!showFilters)}
               className={`p-2 border transition-colors ${showFilters ? 'bg-editorial-border-dark text-white border-editorial-border-dark dark:bg-[#e5e5e5] dark:text-[#111111]' : 'bg-editorial-paper border-editorial-border hover:bg-gray-50 dark:hover:bg-[#262626] dark:border-[#333333]'}`}
               title="Toggle Advanced Filters"
             >
               <Filter className="h-5 w-5" />
             </button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-6 p-6 border border-editorial-border bg-gray-50 dark:bg-[#111111] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in slide-in-from-top-2 duration-200 shadow-sm">
            {/* Category Toggles */}
            <div className="col-span-1 md:col-span-2 lg:col-span-4 flex flex-wrap gap-6 mb-2 pb-6 border-b border-gray-200 dark:border-[#333333]">
               <label className="flex items-center gap-2 text-sm font-sans font-bold cursor-pointer group">
                 <input type="checkbox" checked={filters.showGrants} onChange={e => setFilters(f => ({...f, showGrants: e.target.checked}))} className="w-4 h-4 accent-editorial-border-dark cursor-pointer" />
                 <span className="group-hover:text-editorial-text transition-colors text-editorial-muted">Grants</span>
               </label>
               <label className="flex items-center gap-2 text-sm font-sans font-bold cursor-pointer group">
                 <input type="checkbox" checked={filters.showPreprints} onChange={e => setFilters(f => ({...f, showPreprints: e.target.checked}))} className="w-4 h-4 accent-editorial-border-dark cursor-pointer" />
                 <span className="group-hover:text-editorial-text transition-colors text-editorial-muted">Literature & Pre-prints</span>
               </label>
               <label className="flex items-center gap-2 text-sm font-sans font-bold cursor-pointer group">
                 <input type="checkbox" checked={filters.showCareers} onChange={e => setFilters(f => ({...f, showCareers: e.target.checked}))} className="w-4 h-4 accent-editorial-border-dark cursor-pointer" />
                 <span className="group-hover:text-editorial-text transition-colors text-editorial-muted">Positions & Careers</span>
               </label>
               <label className="flex items-center gap-2 text-sm font-sans font-bold cursor-pointer group">
                 <input type="checkbox" checked={filters.showNews} onChange={e => setFilters(f => ({...f, showNews: e.target.checked}))} className="w-4 h-4 accent-editorial-border-dark cursor-pointer" />
                 <span className="group-hover:text-editorial-text transition-colors text-editorial-muted">News</span>
               </label>
            </div>
            
            {/* Date Range */}
            <div className="flex flex-col gap-2">
               <label className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted">Date From</label>
               <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({...f, dateFrom: e.target.value}))} className="p-2 text-sm border border-editorial-border bg-white dark:bg-[#1e1e1e] focus:outline-none focus:ring-1 focus:ring-editorial-border-dark font-sans" />
            </div>
            <div className="flex flex-col gap-2">
               <label className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted">Date To</label>
               <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({...f, dateTo: e.target.value}))} className="p-2 text-sm border border-editorial-border bg-white dark:bg-[#1e1e1e] focus:outline-none focus:ring-1 focus:ring-editorial-border-dark font-sans" />
            </div>
            
            {/* Text Filters */}
            <div className="flex flex-col gap-2">
               <label className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted">Name / Title</label>
               <input type="text" placeholder="Title matching..." value={filters.name} onChange={e => setFilters(f => ({...f, name: e.target.value}))} className="p-2 text-sm border border-editorial-border bg-white dark:bg-[#1e1e1e] focus:outline-none focus:ring-1 focus:ring-editorial-border-dark font-sans" />
            </div>
            <div className="flex flex-col gap-2">
               <label className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted">Institution</label>
               <input type="text" placeholder="Harvard, MIT..." value={filters.institution} onChange={e => setFilters(f => ({...f, institution: e.target.value}))} className="p-2 text-sm border border-editorial-border bg-white dark:bg-[#1e1e1e] focus:outline-none focus:ring-1 focus:ring-editorial-border-dark font-sans" />
            </div>
            <div className="flex flex-col gap-2">
               <label className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted">Publisher / Source / Agency</label>
               <input type="text" placeholder="Nature, NSF..." value={filters.source} onChange={e => setFilters(f => ({...f, source: e.target.value}))} className="p-2 text-sm border border-editorial-border bg-white dark:bg-[#1e1e1e] focus:outline-none focus:ring-1 focus:ring-editorial-border-dark font-sans" />
            </div>
            <div className="flex flex-col gap-2">
               <label className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted">Author(s)</label>
               <input type="text" placeholder="Smith, J..." value={filters.author} onChange={e => setFilters(f => ({...f, author: e.target.value}))} className="p-2 text-sm border border-editorial-border bg-white dark:bg-[#1e1e1e] focus:outline-none focus:ring-1 focus:ring-editorial-border-dark font-sans" />
            </div>
            
            <div className="col-span-1 md:col-span-2 lg:col-span-4 flex justify-end mt-4">
               <button onClick={() => setFilters({dateFrom: '', dateTo: '', institution: '', name: '', source: '', author: '', showPreprints: true, showGrants: true, showNews: true, showCareers: true})} className="text-xs font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-text transition-colors">
                  Reset All Filters
               </button>
            </div>
          </div>
        )}
      </section>

      {filteredLedger.length === 0 ? (
        <div className="text-center py-20 font-serif italic text-editorial-muted border border-dashed border-gray-300 dark:border-[#404040] bg-gray-50 dark:bg-[#1e1e1e]">
           {searchQuery ? "No historical editions match your search query." : "No historical editions found in the ledger."}
        </div>
      ) : (
        <div className="flex flex-col gap-16">
          {filteredLedger.map((edition, idx) => (
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
