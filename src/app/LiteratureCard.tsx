'use client';

import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';

export function LiteratureCard({ paper }: { paper: any }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [recommendedPapers, setRecommendedPapers] = useState<any[] | null>(null);

  const handleExpand = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isExpanded && !recommendedPapers && paper.doi) {
      setIsExpanded(true);
      setIsLoading(true);
      try {
        const res = await fetch(`/api/semanticscholar?doi=${encodeURIComponent(paper.doi)}`);
        const data = await res.json();
        setRecommendedPapers(data.recommendedPapers || []);
      } catch (err) {
        console.error(err);
        setRecommendedPapers([]);
      } finally {
        setIsLoading(false);
      }
    } else {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <article className="group grid grid-cols-1 md:grid-cols-4 gap-4 border-b border-gray-100 dark:border-[#262626] pb-8 last:border-0 last:pb-0">
      <div className="md:col-span-3 space-y-2 pr-0 md:pr-4">
        <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer" className="block outline-none cursor-pointer">
          <h4 className="font-serif font-bold text-2xl leading-tight group-hover:text-blue-800 dark:group-hover:text-blue-400 transition-colors group-hover:underline decoration-[1.5px] underline-offset-4">{paper.title}</h4>
        </a>
        <p className="font-serif text-editorial-muted italic text-base">{paper.authors}</p>
        <p className="font-sans text-sm text-editorial-text leading-relaxed mt-2">{paper.summary}</p>
        
        {paper.doi && (
          <div className="mt-4 pt-2">
            <button 
              onClick={handleExpand}
              className="font-sans text-xs font-black uppercase tracking-[0.1em] text-[#005587] dark:text-[#60a5fa] hover:text-[#003d61] dark:hover:text-[#93c5fd] flex items-center gap-2 transition-all"
            >
              <span className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>▸</span> 
              Learn More in EvoScout
            </button>
            
            {isExpanded && (
              <div className="mt-4 pl-4 border-l-2 border-[#005587]/30 dark:border-[#60a5fa]/30 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="w-4 h-4 text-editorial-muted" />
                  <span className="text-xs font-bold uppercase tracking-widest text-editorial-muted">Contextual Background</span>
                </div>
                
                {isLoading ? (
                  <div className="flex items-center gap-2 py-4">
                    <div className="w-1.5 h-1.5 bg-[#005587] dark:bg-[#60a5fa] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-[#005587] dark:bg-[#60a5fa] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-[#005587] dark:bg-[#60a5fa] rounded-full animate-bounce"></div>
                    <span className="ml-2 text-xs font-sans text-editorial-muted uppercase tracking-widest">Mining Semantic Scholar...</span>
                  </div>
                ) : recommendedPapers && recommendedPapers.length > 0 ? (
                  <div className="space-y-4 max-h-80 overflow-y-auto custom-scrollbar pr-2 pb-2">
                    {recommendedPapers.map((rec: any) => (
                      <div key={rec.paperId} className="bg-gray-50 dark:bg-[#1a1a1a] p-4 rounded-sm border border-editorial-border transition-colors hover:border-gray-300 dark:hover:border-gray-600">
                        <a href={rec.url} target="_blank" rel="noopener noreferrer" className="block outline-none group/link">
                          <h5 className="font-serif font-bold text-sm leading-tight group-hover/link:text-blue-800 dark:group-hover/link:text-blue-400 group-hover/link:underline decoration-[1px] underline-offset-2 mb-2">{rec.title}</h5>
                        </a>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase font-sans text-editorial-muted tracking-wider mb-2">
                          {rec.authors && rec.authors.length > 0 && (
                            <span className="truncate max-w-[250px]">{rec.authors.map((a:any)=>a.name).join(', ')}</span>
                          )}
                          {rec.year && (
                            <>
                              <span>•</span>
                              <span>{rec.year}</span>
                            </>
                          )}
                        </div>
                        {rec.abstract && (
                          <p className="font-sans text-xs text-editorial-text opacity-90 line-clamp-3 leading-relaxed mt-2">{rec.abstract}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs italic text-editorial-muted">No relevant background papers found in the database for this preprint.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="md:col-span-1 flex flex-col items-start md:items-end justify-start gap-3 border-l-0 md:border-l border-editorial-border md:pl-5 mt-2 md:mt-0">
        <span className="text-[10px] font-sans font-bold uppercase tracking-widest bg-gray-100 dark:bg-[#262626] px-2 py-1 text-center border border-gray-200 dark:border-[#333333]">{paper.journal}</span>
        {paper.institution && (
          <span className="text-xs font-serif font-medium text-editorial-text text-left md:text-right opacity-80 leading-snug">
            {paper.institution}
          </span>
        )}
      </div>
    </article>
  );
}
