"use client";

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/app/providers';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { Trophy, Star, TrendingUp, Search } from 'lucide-react';
import { LiteratureCard } from '@/app/LiteratureCard';

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leaderboardData, setLeaderboardData] = useState<Record<string, any[]>>({});
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!user || hasFetched.current) return;
    hasFetched.current = true;

    async function loadLeaderboard() {
      try {
        // 1. Fetch user routing parameters
        const settingsSnap = await getDoc(doc(db, 'users', user!.uid, 'settings', 'config'));
        const settings = settingsSnap.exists() ? settingsSnap.data() : {};
        
        let rawTopics = "";
        if (settings.topics?.literature && settings.topics.literature.trim() !== '') {
          rawTopics = settings.topics.literature;
        } else {
          rawTopics = "CRISPR, Cas9, RNA, DNA, synthetic biology, gene editing, cancer, oncology, metabolism, computational, epigenetic, genomics, SunTag, prime edit, prime editing, base edit";
        }
        const topics = Array.from(new Set(rawTopics.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)));

        // 2. Fetch past 30 days of literature
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateLimit = thirtyDaysAgo.toISOString();

        const q = query(collection(db, 'users', user!.uid, 'ledger'), orderBy('date', 'desc'));
        const ledgerSnap = await getDocs(q);
        
        let allPapers: any[] = [];
        const seenIds = new Set();

        ledgerSnap.forEach(doc => {
          const data = doc.data();
          if (data.date >= dateLimit && data.news) {
            data.news.forEach((newsItem: any) => {
              if (!seenIds.has(newsItem.id)) {
                seenIds.add(newsItem.id);
                allPapers.push(newsItem);
              }
            });
          }
        });

        // 3. Chronological sorting and aggressive slicing (Fix for infinite loading)
        // Sort by recency to prioritize the absolute freshest breaking news
        allPapers.sort((a, b) => new Date(b.isoDate || b.dateAdded || 0).getTime() - new Date(a.isoDate || a.dateAdded || 0).getTime());
        const recentNews = allPapers.slice(0, 100);

        // Format payload for Reverse Mapping API
        const newsPayload = recentNews.map(p => ({
          id: p.id,
          title: p.title,
          doi: p.doi || "",
          snippet: p.rawSnippet || p.summary || "",
          url: p.url || ""
        }));

        const paperMap: Record<string, any> = {};

        // 4. Batch query Semantic Scholar proxy for Reverse Mapping
        const CHUNK_SIZE = 15; // API caps at 15 items per batch
        for (let i = 0; i < newsPayload.length; i += CHUNK_SIZE) {
          const chunk = newsPayload.slice(i, i + CHUNK_SIZE);
          try {
            const res = await fetch("/api/leaderboard-batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items: chunk })
            });
            if (res.ok) {
              const data = await res.json();
              data.forEach((mappedPaper: any) => {
                if (mappedPaper && mappedPaper.paperId) {
                  paperMap[mappedPaper.paperId] = {
                    id: mappedPaper.originalId,
                    title: mappedPaper.title,
                    authors: mappedPaper.authors,
                    journal: "Semantic Scholar",
                    doi: mappedPaper.paperId,
                    rawAbstract: mappedPaper.abstract,
                    url: mappedPaper.url,
                    citationCount: mappedPaper.citationCount || 0,
                    influentialCitationCount: mappedPaper.influentialCitationCount || 0,
                    isoDate: new Date().toISOString()
                  };
                }
              });
            }
          } catch (e) {
            console.error("Reverse mapping batch failed:", e);
          }
        }

        // 5. Group by topics
        const grouped: Record<string, any[]> = {};
        topics.forEach(t => grouped[t] = []);

        Object.values(paperMap).forEach(paper => {
          const content = `${paper.title || ''} ${paper.rawAbstract || ''}`.toLowerCase();
          topics.forEach(topic => {
            if (content.includes(topic)) {
              grouped[topic].push(paper);
            }
          });
        });

        // 6. Sort and slice top 10
        const finalData: Record<string, any[]> = {};
        topics.forEach(t => {
          if (grouped[t].length > 0) {
            finalData[t] = grouped[t]
              .sort((a, b) => b.influentialCitationCount - a.influentialCitationCount || b.citationCount - a.citationCount)
              .slice(0, 10);
          }
        });

        setLeaderboardData(finalData);
      } catch (err) {
        console.error("Failed to load leaderboard:", err);
      } finally {
        setLoading(false);
      }
    }

    loadLeaderboard();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center font-serif italic text-editorial-muted gap-4">
        <Trophy className="w-12 h-12 animate-pulse text-[#005587] dark:text-[#60a5fa]" />
        Aggregating live academic impact metrics...
      </div>
    );
  }

  const topicKeys = Object.keys(leaderboardData).sort();

  return (
    <div className="min-h-screen pt-24 pb-32 animate-in fade-in duration-500">
      <div className="max-w-[1600px] mx-auto px-6">
        <header className="mb-16 border-b border-editorial-border pb-8 text-center md:text-left">
          <div className="flex flex-col md:flex-row items-center justify-center md:justify-start gap-4 mb-4">
            <Trophy className="w-10 h-10 text-[#005587] dark:text-[#60a5fa]" />
            <h1 className="text-4xl font-serif font-black tracking-tighter uppercase text-editorial-text">
              Monthly Impact Leaderboard
            </h1>
          </div>
          <p className="text-sm font-sans font-medium text-editorial-muted uppercase tracking-widest max-w-3xl mx-auto md:mx-0">
            Live velocity rankings. We aggregate all science journalism from the past 30 days and algorithmically reverse-map the news articles to their underlying primary academic papers using the Semantic Scholar Open Graph API, tracking real-world impact.
          </p>
        </header>

        {topicKeys.length === 0 ? (
          <div className="text-center py-20 border border-editorial-border bg-gray-50/50 dark:bg-black/20">
            <Search className="w-12 h-12 text-editorial-border mx-auto mb-4" />
            <p className="text-lg font-serif italic text-editorial-muted">No highly cited literature found in the past 30 days matching your parameters.</p>
          </div>
        ) : (
          <div className="space-y-24">
            {topicKeys.map((topic) => (
              <section key={topic}>
                <div className="mb-8 border-l-4 border-[#005587] dark:border-[#2563eb] pl-4">
                  <h2 className="text-2xl font-sans font-black uppercase tracking-widest text-editorial-text">
                    {topic}
                  </h2>
                  <p className="text-xs font-sans font-bold text-editorial-muted uppercase tracking-wider mt-1">
                    Top {leaderboardData[topic].length} Papers by Impact
                  </p>
                </div>

                <div className="flex flex-col space-y-8">
                  {leaderboardData[topic].map((paper, idx) => (
                    <LiteratureCard
                      key={paper.id}
                      paper={paper}
                      rank={idx + 1}
                      citationCount={paper.citationCount}
                      influentialCitationCount={paper.influentialCitationCount}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
