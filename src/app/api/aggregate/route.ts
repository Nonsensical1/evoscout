import { NextResponse } from 'next/server';
import Parser from 'rss-parser';

// Utility to shuffle array
function shuffleArray(array: any[]) {
  return array.sort(() => 0.5 - Math.random());
}

const FALLBACK_EVENTS = [
  {
    id: "HIST-1953-XYZ",
    year: 1953,
    text: "James Watson and Francis Crick publish their paper describing the double helix structure of DNA, revolutionizing molecular biology and genetics.",
    pageUrl: "https://en.wikipedia.org/wiki/DNA"
  },
  {
    id: "HIST-1996-XYZ",
    year: 1996,
    text: "Dolly the sheep becomes the first mammal cloned from an adult somatic cell, a monumental milestone in genetics and synthetic bio-potential.",
    pageUrl: "https://en.wikipedia.org/wiki/Dolly_(sheep)"
  },
  {
    id: "HIST-2001-XYZ",
    year: 2001,
    text: "The initial sequencing of the human genome is published simultaneously in Nature and Science, unlocking the modern era of genomics.",
    pageUrl: "https://en.wikipedia.org/wiki/Human_Genome_Project"
  },
  {
    id: "HIST-2012-XYZ",
    year: 2012,
    text: "Jennifer Doudna and Emmanuelle Charpentier publish their landmark paper on CRISPR-Cas9, proving it could be programmed for precision gene editing.",
    pageUrl: "https://en.wikipedia.org/wiki/CRISPR"
  }
];

// Top-40 university keywords for prestige-tier preprint sorting.
// Matched case-insensitively against the corresponding author's institution string.
const TOP_40_UNIVERSITY_KEYWORDS = [
  'harvard', 'mit', 'massachusetts institute of technology',
  'stanford', 'caltech', 'california institute of technology',
  'cambridge', 'oxford', 'imperial college',
  'yale', 'princeton', 'columbia', 'penn', 'upenn', 'university of pennsylvania',
  'johns hopkins', 'duke', 'cornell', 'dartmouth',
  'chicago', 'university of chicago',
  'northwestern', 'vanderbilt', 'notre dame',
  'ucla', 'uc san diego', 'ucsd', 'ucsf', 'uc san francisco',
  'michigan', 'university of michigan',
  'washington university', 'washington university in st',
  'university of washington',
  'carnegie mellon', 'rice', 'emory', 'tufts', 'georgetown',
  'toronto', 'mcgill', 'edinburgh', 'ucl', 'university college london',
  'eth zurich', 'epfl', 'karolinska', 'heidelberg',
  'tokyo', 'kyoto', 'national university of singapore', 'nus',
  'broad institute', 'sanger', 'cold spring harbor', 'hhmi', 'scripps',
  'rockefeller', 'sloan kettering', 'dana-farber', 'md anderson'
];

function isTopInstitution(institution: string): boolean {
  if (!institution) return false;
  const lower = institution.toLowerCase();
  return TOP_40_UNIVERSITY_KEYWORDS.some(kw => lower.includes(kw));
}

async function fetchLiveData(topicsMap: any = {}) {
  const parseTopics = (str: string | undefined, fallback: string[]) => str ? str.split(',').map((s: string) => s.trim()).filter(Boolean) : fallback;
  const parser = new Parser({ 
    customFields: { item: [['media:thumbnail', 'mediaThumbnail']] },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*'
    }
  });
  const results: any = { grants: [], openGovGrants: [], news: [], literature: [], positions: [] };
  const usedImages = new Set<string>(); // Global pool to prevent duplicate photos

  const getProminentWord = (title: string) => {
    const preferredWords = ['CRISPR', 'Cas9', 'Cas12', 'RNA', 'DNA', 'gene', 'cell', 'cancer', 'tumor', 'bacteria', 'virus', 'molecular', 'synthetic', 'epigenetic', 'genetics', 'pathology', 'brain', 'immune', 'protein', 'proteomics', 'metabolism', 'quantum', 'neuro', 'biology', 'microbiome', 'therapy', 'zoology'];
    const titleLower = (title || "").toLowerCase();

    for (const pref of preferredWords) {
      const regex = new RegExp(`\\b${pref.toLowerCase()}\\b`);
      if (regex.test(titleLower)) {
        return pref;
      }
    }

    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'of', 'about', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'may', 'might', 'must', 'new', 'how', 'why', 'what', 'where', 'when', 'who', 'which', 'study', 'research', 'scientists', 'discover', 'discovery', 'finds', 'findings', 'shows', 'reveals', 'uncovers', 'identifies', 'novel', 'allows', 'using', 'during', 'expression', 'mechanism', 'analysis', 'through', 'between', 'human', 'their', 'these', 'those', 'that', 'this', 'than', 'then']);
    const words = (title || "").replace(/[^a-zA-Z0-9 -]/g, '').split(/[ -]+/);
    let longest = "biology";
    let maxLen = 0;
    for (const w of words) {
      const lower = w.toLowerCase();
      if (!stopWords.has(lower) && w.length > maxLen) {
        longest = w;
        maxLen = w.length;
      }
    }
    return longest;
  };

  try {
    const todayVal = new Date();
    const thirtyDaysAgo = new Date(todayVal.getTime() - 30 * 24 * 60 * 60 * 1000);
    const formatDateNSF = (date: Date) => `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`;
    const formatDateNIH = (date: Date) => date.toISOString().split('T')[0];

    const nsfTopics = parseTopics(topicsMap.grants, [
      "molecular+biology", "bioinformatics", "proteomics", "genomics",
      "epigenetics", "translational+science", "pathology", "zoology"
    ]);
    const nihTopics = parseTopics(topicsMap.grants, [
      "molecular biology", "bioinformatics", "proteomics", "genomics",
      "epigenetics", "translational science", "pathology", "zoology"
    ]);

    const topicIdx = Math.floor(Math.random() * nsfTopics.length);
    const randomKeywordNSF = nsfTopics[topicIdx];
    const randomKeywordNIH = nihTopics[topicIdx % nihTopics.length];

    let allGrants: any[] = [];

    // NSF Scrape
    try {
      const nsfRes = await fetch(`https://api.nsf.gov/services/v1/awards.json?keyword=${randomKeywordNSF}&printFields=id,title,awardeeName,fundsObligatedAmt&dateStart=${formatDateNSF(thirtyDaysAgo)}`);
      if (nsfRes.ok) {
        const nsfData = await nsfRes.json();
        const awards = nsfData.response?.award || [];
        const mappedNSF = awards.map((a: any) => ({
          id: `NSF-${a.id}`,
          title: a.title,
          agency: a.awardeeName || "National Science Foundation",
          amount: a.fundsObligatedAmt ? `$${Number(a.fundsObligatedAmt).toLocaleString()}` : "N/A",
          url: `https://www.nsf.gov/awardsearch/showAward?AWD_ID=${a.id}`
        }));
        allGrants = allGrants.concat(mappedNSF);
      }
    } catch (e) { console.error("NSF Grant Fetch Error:", e); }

    // NIH Scrape
    try {
      const nihRes = await fetch(`https://api.reporter.nih.gov/v2/projects/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          criteria: {
            advanced_text_search: { search_text: randomKeywordNIH },
            project_start_date: {
              from_date: formatDateNIH(thirtyDaysAgo),
              to_date: formatDateNIH(todayVal)
            }
          },
          offset: 0,
          limit: 30
        })
      });

      if (nihRes.ok) {
        const nihData = await nihRes.json();
        const awards = nihData.results || [];
        const mappedNIH = awards.map((a: any) => ({
          id: `NIH-${a.appl_id}`,
          title: a.project_title,
          agency: a.organization?.org_name || "NIH Research Institute",
          amount: a.award_amount ? `$${Number(a.award_amount).toLocaleString()}` : "N/A",
          url: a.project_detail_url || `https://reporter.nih.gov/project-details/${a.appl_id}`
        }));
        allGrants = allGrants.concat(mappedNIH);
      }
    } catch (e) { console.error("NIH Grant Fetch Error:", e); }

    results.grants = shuffleArray(allGrants);

    // GovGrants Scrape (Expanding Window)
    try {
      let activeGovGrants: any[] = [];
      const intervals = [48, 7 * 24, 14 * 24]; // hours limit
      const govTopics = parseTopics(topicsMap.openGovGrants, nihTopics);
      const randomKeywordGov = govTopics[Math.floor(Math.random() * govTopics.length)];
      
      for (const hours of intervals) {
        const timeLimit = Date.now() - hours * 60 * 60 * 1000;
        
        const govRes = await fetch(`https://apply07.grants.gov/grantsws/rest/opportunities/search/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: randomKeywordGov })
        });
        
        if (govRes.ok) {
          const govData = await govRes.json();
          const hits = govData.oppHits || [];
          
          const recentOpen = hits.filter((h: any) => {
            if (h.oppStatus !== 'posted') return false;
            if (!h.openDate) return false;
            const openDate = new Date(h.openDate).getTime();
            return openDate >= timeLimit;
          });
          
          if (recentOpen.length > 0) {
            activeGovGrants = recentOpen.map((h: any) => ({
              id: `GOV-${h.id}`,
              title: h.title,
              agency: h.agencyCode || h.agency || "Grants.gov",
              amount: "Details at Registry", // GovGrants search doesn't natively expose discrete obligation totals
              url: `https://www.grants.gov/search-results-detail/${h.id}`
            }));
            break; // Stop expanding window
          }
        }
      }
      results.openGovGrants = shuffleArray(activeGovGrants);
    } catch (e) { console.error("Gov Grants Fetch Error:", e); }

  } catch (e) { console.error("Master Grant Pipeline Error:", e); }

  try {
    const rssFeeds = [
      { url: 'https://www.nature.com/nature.rss', source: 'Nature' },
      { url: 'https://www.science.org/rss/news_current.xml', source: 'Science Mag' },
      { url: 'https://phys.org/rss-feed/biology-news/', source: 'Phys.org' },
      { url: 'https://www.cell.com/cell/inpress.rss', source: 'Cell Press' }
    ];
    let allNews: any[] = [];
    const newsTermsSafe = topicsMap.news ? topicsMap.news.split(',').map((s:string)=>s.trim()).filter(Boolean).join('|') : "CRISPR|Cas9|Cas12|gene|cell|RNA|proteomics|synthetic biology|epigenetic|microbiome|cancer|DNA|pathology|zoology";
    const biologicalTerms = new RegExp(newsTermsSafe, 'i');
    let newsLookbackHours = 48; // Rolling 48-hour window (captures everything published 'yesterday' and 'today' globally)
    const dayOfWeek = new Date().getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
    // Expand window ONLY on Sundays when the primary wire is offline
    if (dayOfWeek === 0) newsLookbackHours = 72; // Sunday (looks back over Fri/Sat)
    
    const timeWindowLimit = Date.now() - newsLookbackHours * 60 * 60 * 1000;

    for (const feedConfig of rssFeeds) {
      try {
        const feed = await parser.parseURL(feedConfig.url);
        const filteredNews = feed.items.filter((item: any) => {
          const isBioMatch = biologicalTerms.test(item.title || '') || biologicalTerms.test(item.contentSnippet || '');
          const isRecent = item.isoDate ? (new Date(item.isoDate).getTime() > timeWindowLimit) : true;
          return isBioMatch && isRecent;
        });

        const mapped = await Promise.all(filteredNews.map(async (item: any, i: number) => {
          let image = "";
          let sourceImg = item.enclosure?.url || item.mediaThumbnail?.['$']?.url;
          if (sourceImg && sourceImg.includes('/tmb/')) {
            sourceImg = sourceImg.replace('/tmb/', '/800w/');
          }
          if (sourceImg && !usedImages.has(sourceImg)) {
            image = sourceImg;
            usedImages.add(image);
          } else if (!sourceImg) {
            try {
              const searchKeyword = getProminentWord(item.title);
              const KeywordQuery = searchKeyword + " science"
              const pexelsRes = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(KeywordQuery)}&per_page=30&size=large&orientation=landscape`, {
                headers: { Authorization: "c5w6mctmy3dgyaA69iUsDjgccGUojIlKEa3Y8JtsLU2yJm2HUp2gjQy6" }
              });
              if (pexelsRes.ok) {
                const pexelsData = await pexelsRes.json();
                if (pexelsData.photos && pexelsData.photos.length > 0) {
                  // Filter out any photos already used across the entire dashboard
                  const availablePhotos = pexelsData.photos.filter((p: any) => !usedImages.has(p.src.original));
                  if (availablePhotos.length > 0) {
                    const randomIdx = Math.floor(Math.random() * availablePhotos.length);
                    image = availablePhotos[randomIdx].src.original;
                    usedImages.add(image);
                  }
                }
              }
            } catch (e) { }
          }
          // Ultimate fallback — only if nothing was assigned
          if (!image) {
            image = "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?ixlib=rb-1.2.1&auto=format&fit=crop&w=2560&q=100";
          }
          return {
            id: `NEWS-${feedConfig.source.substring(0, 3).toUpperCase()}-${item.guid || item.link || i}`.replace(/[^a-zA-Z0-9-]/g, ''),
            title: item.title || "Science Update",
            source: feedConfig.source,
            url: item.link || "",
            image: image,
            rawSnippet: item.contentSnippet,
            isoDate: item.isoDate || new Date().toISOString()
          };
        }));
        allNews = allNews.concat(mapped);
      } catch (e) { console.error(`News Fetch Error for ${feedConfig.source}:`, e); }
    }

    results.news = allNews.sort((a, b) => new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime());
  } catch (e) { console.error("Top-level News Fetch Error:", e); }

  try {
    let end = new Date();
    let start = new Date();
    const dStr = (d: Date) => d.toISOString().split('T')[0];
    
    let bioRes = await fetch(`https://api.biorxiv.org/details/biorxiv/${dStr(start)}/${dStr(end)}`);
    let bioText = await bioRes.text();
    
    // BioRxiv crashes and returns HTML if you query a UTC date that hasn't started in the US yet.
    if (bioText.startsWith('<')) {
        end.setDate(end.getDate() - 1);
        start.setDate(start.getDate() - 1);
        bioRes = await fetch(`https://api.biorxiv.org/details/biorxiv/${dStr(start)}/${dStr(end)}`);
        bioText = await bioRes.text();
    }
    
    if (bioRes.ok && !bioText.startsWith('<')) {
      const bioData = JSON.parse(bioText);
      let papers = bioData.collection || [];
      const litTermsSafe = topicsMap.literature ? topicsMap.literature.split(',').map((s:string)=>s.trim()).filter(Boolean).join('|') : "CRISPR|Cas9|RNA|DNA|synthetic biology|gene editing|cancer|oncology|metabolism|computational|epigenetic|genomics|SunTag|prime edit|base edit";
      const advancedTopics = new RegExp(litTermsSafe, 'i');
      let filtered = papers.filter((p: any) => advancedTopics.test(p.title || '') || advancedTopics.test(p.abstract || ''));
      if (filtered.length < 5) filtered = papers;

      const uniquePapers = Array.from(new Map(filtered.map((p: any) => [p.doi, p])).values()) as any[];
      results.literature = uniquePapers
        .map((p: any) => ({
          id: `LIT-${p.doi}`,
          title: p.title,
          authors: p.authors || "Various Authors",
          institution: p.author_corresponding_institution || "",
          journal: "bioRxiv",
          doi: p.doi,
          rawAbstract: p.abstract,
          isoDate: p.date ? new Date(p.date).toISOString() : new Date().toISOString()
        }))
        .sort((a, b) => {
          // Tier 1: top-40 institution papers come first
          const aTop = isTopInstitution(a.institution) ? 0 : 1;
          const bTop = isTopInstitution(b.institution) ? 0 : 1;
          if (aTop !== bTop) return aTop - bTop;
          // Tier 2: within the same prestige group, sort by most recent
          return new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime();
        });
    }
  } catch (e) { console.error("Lit Fetch Error:", e); }

  try {
    // Utilize the core 'news' topics array for granular career subject filtering, per user request
    const userTopics = topicsMap.news
      ? topicsMap.news.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean)
      : null;
      
    const searchParam = userTopics && userTopics.length > 0 ? userTopics[0] : "biology";
    
    // Create a strict regex for career relevance (same as news/literature)
    const careerTermsSafe = topicsMap.news ? topicsMap.news.split(',').map((s:string)=>s.trim()).filter(Boolean).join('|') : "CRISPR|Cas9|Cas12|gene|cell|RNA|proteomics|synthetic biology|epigenetic|microbiome|cancer|DNA|pathology|zoology|microbiology|molecular|biotech";
    const biologicalCareerTerms = new RegExp(careerTermsSafe, 'i');

    let federalJobs: any[] = [];
    let rapidJobs: any[] = [];
    let rssJobs: any[] = [];

    // ──────────────────────────────────────────────────────────────────────
    // AGGRESSIVE EXPERIENCE-LEVEL FILTER — applied to ALL pools pre-merge
    // ──────────────────────────────────────────────────────────────────────
    const NEGATIVE_TITLE_KEYWORDS = [
      'senior', 'sr.', 'sr ', 'principal', 'staff', 'lead', 'director',
      'manager', 'vp ', 'vice president', 'chief', 'head of',
      'postdoc', 'post-doc', 'postdoctoral', 'post-doctoral',
      'phd', 'ph.d', 'doctorate', 'doctoral',
      'professor', 'assistant professor', 'associate professor', 'lecturer',
      'tenure', 'tenured', 'faculty', 'chair',
      'executive', 'architect', 'distinguished', 'emeritus',
      '10+ years', '8+ years', '7+ years', '5+ years',
      'experienced', 'mid-senior',
      'head ', 'dean', 'provost',
      ' ii', ' iii', ' iv',
      'specialist ii', 'specialist iii',
      'scientist ii', 'scientist iii', 'engineer ii', 'engineer iii',
      'established investigator', 'group leader',
      'attending', 'physician',
      'research fellow', 'postdoctoral fellow'
    ];
    const POSITIVE_TITLE_KEYWORDS = [
      'intern', 'internship', 'entry level', 'entry-level',
      'junior', 'jr.', 'jr ', 'associate', 'trainee', 'apprentice',
      'undergraduate', 'undergrad', 'student',
      'assistant', 'coordinator', 'analyst', 'technician',
      'new grad', 'recent graduate', 'early career',
      'co-op', 'coop', 'fellowship', 'rotational'
    ];

    /** Returns true if a job should be KEPT (i.e. is NOT a senior-level position AND is relevant to topics). */
    const isValidJob = (title: string, rawText: string): boolean => {
      const titleLower = title.toLowerCase();
      
      // Hard reject: generic non-science roles that might slip through search queries
      const NON_SCIENCE_ROLES = ['police', 'firefighter', 'publisher', 'sales', 'marketing', 'accountant', 'hr ', 'human resources', 'recruiter', 'driver', 'custodian', 'security', 'law enforcement'];
      for (const non of NON_SCIENCE_ROLES) {
        if (titleLower.includes(non)) return false;
      }

      // Hard reject: any negative keyword in the title alone is an immediate disqualify
      for (const neg of NEGATIVE_TITLE_KEYWORDS) {
        if (titleLower.includes(neg)) return false;
      }
      // Soft reject: senior-level signals in description body
      const seniorDescPatterns = /\b(10\+|8\+|7\+|6\+|5\+)\s*years?\b|\bsenior\b|\bpostdoc|\bph\.?d\s*(required|preferred|only)|\bmanag(e|ing)\s+(a\s+)?team/i;
      if (seniorDescPatterns.test(rawText)) return false;
      
      // Strict Relevance Filter: Must match at least one biological/news topic in title or description
      const fullText = `${title} ${rawText}`;
      if (!biologicalCareerTerms.test(fullText)) return false;
      
      return true;
    };

    /** Sorts jobs so those with positive entry-level signals appear first. */
    const boostEntryLevel = (jobs: any[]) => {
      return [...jobs].sort((a, b) => {
        const aHit = POSITIVE_TITLE_KEYWORDS.some(kw => (a.title || '').toLowerCase().includes(kw)) ? 0 : 1;
        const bHit = POSITIVE_TITLE_KEYWORDS.some(kw => (b.title || '').toLowerCase().includes(kw)) ? 0 : 1;
        return aHit - bHit;
      });
    };

    // ──────────────────────────────────────────────────────────────────────
    // RUN ALL 3 SOURCE GROUPS IN PARALLEL (USAJobs + 6x RapidAPI + RSS)
    // ──────────────────────────────────────────────────────────────────────
    const usajobsPromise = (async () => {
      try {
        if (process.env.USAJOBS_API_KEY && process.env.USAJOBS_USER_EMAIL) {
            const usajobsRes = await fetch(`https://data.usajobs.gov/api/search?Keyword=${encodeURIComponent(searchParam)}`, {
                headers: {
                    'Host': 'data.usajobs.gov',
                    'User-Agent': process.env.USAJOBS_USER_EMAIL,
                    'Authorization-Key': process.env.USAJOBS_API_KEY
                }
            });
            if (usajobsRes.ok) {
                const usajobsData = await usajobsRes.json();
                const items = usajobsData.SearchResult?.SearchResultItems || [];
                return items.map((item: any, i: number) => {
                    const pos = item.MatchedObjectId || "";
                    const title = item.MatchedObjectDescriptor?.PositionTitle || "Federal Position";
                    const institution = item.MatchedObjectDescriptor?.OrganizationName || "US Federal Government";
                    return {
                         id: `USAJ-${pos || i}`.replace(/[^a-zA-Z0-9-]/g, ''),
                         title: title,
                         institution: institution,
                         location: 'US',
                         experienceLevel: 'Undergraduate / Entry Level',
                         url: item.MatchedObjectDescriptor?.PositionURI || "https://usajobs.gov",
                         dateAdded: new Date().toISOString(),
                         rawText: `${institution} - ${title}. Requirements: ${item.MatchedObjectDescriptor?.UserArea?.Details?.JobSummary || ""}`
                    };
                });
            }
        }
        return [];
      } catch (e) { console.error("USAJobs API Error:", e); return []; }
    })();

    const rapidApiPromise = (async () => {
      try {
        if (!process.env.FANTASTIC_JOBS_API_KEY) {
          console.warn('[FantasticJobs] ⚠ FANTASTIC_JOBS_API_KEY is not set — skipping all 6 RapidAPI endpoints. Careers will only use USAJobs + RSS feeds.');
          return [];
        }
        const rapidHeaders = {
            'Content-Type': 'application/json',
            'x-rapidapi-key': process.env.FANTASTIC_JOBS_API_KEY
        };
        
        // All 6 Fantastic.jobs endpoints fire simultaneously
        const extractJobs = (data: any): any[] => {
            if (Array.isArray(data)) return data;
            return data.jobs || data.data || data.results || [];
        };

        const fetchDefinitions = [
            { label: 'Active Jobs DB', url: `https://active-jobs-db.p.rapidapi.com/active-ats-1h?offset=0&include_ai=true&title_filter=%22${encodeURIComponent(searchParam)}%22&location_filter=%22United%20States%22%20OR%20%22United%20Kingdom%22&description_type=text`, host: 'active-jobs-db.p.rapidapi.com' },
            { label: 'Startup Jobs', url: `https://startup-jobs-api.p.rapidapi.com/active-jb-7d?source=ycombinator`, host: 'startup-jobs-api.p.rapidapi.com' },
            { label: 'Internships', url: `https://internships-api.p.rapidapi.com/active-jb-7d`, host: 'internships-api.p.rapidapi.com' },
            { label: 'YC Free Jobs', url: `https://free-y-combinator-jobs-api.p.rapidapi.com/active-jb-7d`, host: 'free-y-combinator-jobs-api.p.rapidapi.com' },
            { label: 'Workday Jobs', url: `https://workday-jobs-api.p.rapidapi.com/active-ats-24h?include_ai=true&title_filter=%22${encodeURIComponent(searchParam)}%22&location_filter=%22United%20States%22`, host: 'workday-jobs-api.p.rapidapi.com' },
            { label: 'Job Postings Feed', url: `https://job-posting-feed-api.p.rapidapi.com/active-ats-6m?include_ai=true&description_type=text`, host: 'job-posting-feed-api.p.rapidapi.com' }
        ];

        let fjItems: any[] = [];
        
        for (const def of fetchDefinitions) {
            try {
                const res = await fetch(def.url, {
                    headers: { ...rapidHeaders, 'x-rapidapi-host': def.host }
                });
                
                if (res.ok) {
                    const body = await res.json();
                    const items = extractJobs(body);
                    console.log(`[FantasticJobs] ${def.label}: ${items.length} jobs ingested`);
                    fjItems = fjItems.concat(items);
                } else {
                    console.warn(`[FantasticJobs] ${def.label}: HTTP ${res.status}`);
                }
            } catch (err) {
                console.error(`[FantasticJobs] ${def.label} network error:`, err);
            }
            // Sequential delay to protect against RapidAPI rate limit spikes
            await new Promise(r => setTimeout(r, 800));
        }
        
        return fjItems.map((job: any, i: number) => ({
             id: `FJRAPID-${job.id || job.uuid || job.job_id || i}`.replace(/[^a-zA-Z0-9-]/g, ''),
             title: job.title || job.job_title || "Specialist",
             institution: job.company_name || job.company || job.organization || "Private Enterprise",
             location: job.location || job.location_name || job.city || 'US',
             experienceLevel: job.experience_level || job.ai_experience_level || 'Undergraduate / Entry Level',
             url: job.url || job.job_url || job.apply_url || job.application_url || "https://fantastic.jobs",
             dateAdded: job.posted_at || job.date_posted || job.created_at || new Date().toISOString(),
             rawText: job.description || job.snippet || job.job_description || ""
        }));
      } catch (e) { console.error("RapidAPI FantasticJobs Error:", e); return []; }
    })();

    const rssPromise = (async () => {
      const jobFeeds = [
         { url: 'https://jobs.sciencecareers.org/jobsrss/?countrycode=US', flag: 'science' },
         { url: 'https://www.nature.com/naturecareers/jobsrss/?countrycode=US', flag: 'nature' },
         { url: 'https://www.biospace.com/jobs/rss', flag: 'biospace' },
         { url: 'https://jobs.newscientist.com/en-gb/jobsrss/', flag: 'newscientist' }
      ];
      let collected: any[] = [];
      for (const feedConfig of jobFeeds) {
           try {
               const feed = await parser.parseURL(feedConfig.url);
               let items = feed.items;
               
               if (userTopics && userTopics.length > 0) {
                   items = items.filter((item: any) => {
                       const desc = (item.contentSnippet || "").toLowerCase();
                       const title = (item.title || "").toLowerCase();
                       return userTopics.some((ui: string) => desc.includes(ui) || title.includes(ui));
                   });
               }

               const mapped = items.map((item: any, i: number) => {
                   let title = item.title || "Research Position";
                   let institution = 'US Research Hub';
                   if (title.includes(':')) {
                       const parts = title.split(':');
                       institution = parts[0].trim();
                       title = parts.slice(1).join(':').trim();
                   }
                   return {
                       id: `CAREER-${item.guid || item.link || i}`.replace(/[^a-zA-Z0-9-]/g, ''),
                       title: title,
                       institution: institution,
                       location: 'US',
                       experienceLevel: 'Undergraduate / Entry Level',
                       url: item.link || "https://sciencecareers.org",
                       dateAdded: item.isoDate || new Date().toISOString(),
                       rawText: item.contentSnippet || ""
                   };
               });
               collected = collected.concat(mapped);
           } catch (e) { 
               console.warn(`[Jobs RSS] Skipping feed ${feedConfig.url} due to parsing error: ${e instanceof Error ? e.message : 'Unknown'}`); 
           }
      }
      return collected;
    })();

    // AWAIT ALL THREE SOURCE GROUPS IN PARALLEL
    const [usajobsRaw, rapidRaw, rssRaw] = await Promise.all([usajobsPromise, rapidApiPromise, rssPromise]);

    // ──────────────────────────────────────────────────────────────────────
    // PRE-MERGE ENTRY-LEVEL FILTER — strip senior/PhD/postdoc from ALL pools
    // ──────────────────────────────────────────────────────────────────────
    federalJobs = boostEntryLevel(shuffleArray(usajobsRaw.filter((j: any) => isValidJob(j.title, j.rawText))));
    rapidJobs   = boostEntryLevel(shuffleArray(rapidRaw.filter((j: any) => isValidJob(j.title, j.rawText))));
    rssJobs     = boostEntryLevel(shuffleArray(rssRaw.filter((j: any) => isValidJob(j.title, j.rawText))));

    console.log(`[Careers] Source breakdown — Federal: ${usajobsRaw.length} raw → ${federalJobs.length} filtered | RapidAPI: ${rapidRaw.length} raw → ${rapidJobs.length} filtered | RSS: ${rssRaw.length} raw → ${rssJobs.length} filtered`);
    console.log(`[Careers] Post-filter counts — Federal: ${federalJobs.length}, RapidAPI(6): ${rapidJobs.length}, RSS: ${rssJobs.length}`);
    
    // ──────────────────────────────────────────────────────────────────────
    // WEIGHTED ROUND-ROBIN MERGE — 1 federal : 3 rapid : 1 RSS per cycle
    // RapidAPI gets 3x slots per cycle because it represents 6 APIs and
    // should not be under-represented vs single-source pools.
    // ──────────────────────────────────────────────────────────────────────
    results.positions = [];
    const targetTotal = 50;
    
    while(results.positions.length < targetTotal) {
        let added = false;
        // 1 federal slot
        if(federalJobs.length > 0) { results.positions.push(federalJobs.shift()); added = true; }
        // 3 rapid slots (one per cycle to give 6 APIs proportional representation)
        for (let r = 0; r < 3 && rapidJobs.length > 0; r++) {
            results.positions.push(rapidJobs.shift()); added = true;
        }
        // 1 RSS slot
        if(rssJobs.length > 0) { results.positions.push(rssJobs.shift()); added = true; }
        
        if(!added) break;
    }

    // Drain any remaining from rapidJobs if we haven't hit 50 yet
    while (results.positions.length < targetTotal && rapidJobs.length > 0) {
        results.positions.push(rapidJobs.shift());
    }
    // Same for federal and RSS
    while (results.positions.length < targetTotal && federalJobs.length > 0) {
        results.positions.push(federalJobs.shift());
    }
    while (results.positions.length < targetTotal && rssJobs.length > 0) {
        results.positions.push(rssJobs.shift());
    }
    
    // Final shuffle to randomize the weighted list
    results.positions = shuffleArray(results.positions);
    
    // ──────────────────────────────────────────────────────────────────────
    // GEMINI PASS — extract true institution, experience level & location
    // ──────────────────────────────────────────────────────────────────────
    try {
        const geminiKey = process.env.GEMINI_API_KEY;
        if (geminiKey && results.positions.length > 0) {
            const aiPayload = results.positions.map((p: any) => ({ id: p.id, title: p.title, raw: p.rawText }));
            const prompt = `You are parsing raw job descriptions. For each job, determine:
1. The true hiring Institution/Company name.
2. The Experience Level — use EXACTLY one of: "Internship", "Undergraduate / Entry Level", "Junior", "Mid-Level", "Senior", "PhD / Postdoctoral", "Faculty / Professor", "Management / Director".
3. The Location (city, state, or country).

CRITICAL RULES:
- If the title or description contains words like "Senior", "Principal", "Director", "VP", "Postdoc", "PhD required", "Professor", "Faculty", "10+ years", classify the experience level accordingly — do NOT default to entry level.
- Only use "Undergraduate / Entry Level" for positions that genuinely require 0-2 years experience, a bachelor's degree, or are explicitly labeled entry-level.
- Internships, co-ops, and trainee roles should be "Internship".

Return ONLY a strict JSON object mapping each job 'id' to: { institution: string, experienceLevel: string, location: string }.
Jobs: ${JSON.stringify(aiPayload)}`;
            
            const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
              })
            });
            
            if (gRes.ok) {
               const gData = await gRes.json();
               const parsedAI = JSON.parse(gData.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
               results.positions = results.positions.map((p: any) => {
                   if (parsedAI[p.id]) {
                       p.institution = parsedAI[p.id].institution && parsedAI[p.id].institution !== "US Research Hub" ? parsedAI[p.id].institution : p.institution;
                       p.experienceLevel = parsedAI[p.id].experienceLevel || "Undergraduate / Entry Level";
                       p.location = parsedAI[p.id].location || p.location;
                   }
                   delete p.rawText; // Clean payload before saving to firebase
                   return p;
               });
            }
        }
    } catch (e) { console.error("Careers Gemini Intercept Error:", e); }

    // ──────────────────────────────────────────────────────────────────────
    // POST-GEMINI HARD FILTER — reject anything Gemini classified as senior+
    // This is the safety net that catches positions the keyword filter missed
    // ──────────────────────────────────────────────────────────────────────
    const REJECTED_LEVELS = ['senior', 'phd', 'postdoc', 'post-doc', 'postdoctoral', 'faculty', 'professor', 'management', 'director', 'mid-level', 'mid level'];
    const beforeCount = results.positions.length;
    results.positions = results.positions.filter((p: any) => {
        const level = (p.experienceLevel || '').toLowerCase();
        return !REJECTED_LEVELS.some(rej => level.includes(rej));
    });

    // ──────────────────────────────────────────────────────────────────────
    // SORT BY EXPERIENCE LEVEL
    // ──────────────────────────────────────────────────────────────────────
    const EXP_ORDER: Record<string, number> = {
        "internship": 1,
        "undergraduate / entry level": 2,
        "junior": 3,
        "mid-level": 4,
    };
    
    results.positions.sort((a: any, b: any) => {
        const aVal = EXP_ORDER[(a.experienceLevel || "").toLowerCase()] || 99;
        const bVal = EXP_ORDER[(b.experienceLevel || "").toLowerCase()] || 99;
        return aVal - bVal;
    });

    console.log(`[Careers] Post-Gemini filter: ${beforeCount} → ${results.positions.length} positions (removed ${beforeCount - results.positions.length} senior/PhD/faculty roles)`);
  } catch (e) { console.error("Evergreen Careers Error:", e); }

  try {
    const summarizedItems = [
      ...results.news.map((n: any) => ({ id: n.id, text: n.rawSnippet || "" })),
      ...results.literature.map((l: any) => ({ id: l.id, text: l.rawAbstract || "" }))
    ].filter(item => item.text.length > 50);

    const chunkArray = (arr: any[], size: number) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
         chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    const batches = chunkArray(summarizedItems, 20);
    const masterSummaryDict: any = {};

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        const prompt = `Summarize the following scientific articles into a 2-3 sentence AI summary. Return ONLY a strict JSON object mapping the article 'id' to the 'summary' string. Do not use markdown wrappers. Articles: ${JSON.stringify(batch)}`;
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) throw new Error("Missing GEMINI_API_KEY env var");
        
        const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
            safetySettings: [
               { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
               { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
               { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
               { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" }
            ]
          })
        });
        
        if (!gRes.ok) throw new Error(`Gemini API Error: ${gRes.status}`);
        const gData = await gRes.json();
        const rawText = gData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const parsed = JSON.parse(rawText);
        Object.assign(masterSummaryDict, parsed);

        // Gently throttle seq calls to protect Free Tier (15 RPM max)
        if (i < batches.length - 1) {
            await new Promise(res => setTimeout(res, 4100));
        }

      } catch (e) {
        console.warn(`[Gemini] Batch summarization failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    results.news = results.news.map((n: any) => ({
      ...n,
      summary: masterSummaryDict[n.id] || (n.rawSnippet ? n.rawSnippet.substring(0, 150) + "..." : "Special editorial reporting on sector advancements, diving deep into technical feasibility.")
    }));

    results.literature = results.literature.map((l: any) => ({
      ...l,
      summary: masterSummaryDict[l.id] || (l.rawAbstract ? l.rawAbstract.substring(0, 150) + "..." : "Early reviews indicate substantial progress in targeted methodologies, potentially altering widespread paradigms.")
    }));
  } catch(e) { console.error("Gemini pipeline error:", e); }

  // === THIS DAY IN HISTORY — NYT Article Search API ===
  try {
    const NYT_API_KEY = process.env.NYT_API_KEY || 'Zg3680b2RjPZAhZMb4LX0b8QYc4iF8XcXwGG5Dg3exNRiTJT';

    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const monthDay = `${mm}${dd}`;
    const currentYear = today.getFullYear();

    // Build a concise OR-joined query from user's news topics, or fall back to defaults
    const defaultQuery =
      'biology OR genetics OR CRISPR OR cancer OR genomics OR proteomics OR science';
    const scienceQuery = topicsMap.news
      ? topicsMap.news
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
          .slice(0, 5)
          .join(' OR ')
      : defaultQuery;

    // Sample 5 random historical years (min 1920) to stay within NYT 5 req/min free tier maximums
    const targetYears: number[] = [];
    const minYear = 1920;
    let attempts = 0;
    while (targetYears.length < 5 && attempts < 20) {
      const year = Math.floor(Math.random() * (currentYear - minYear)) + minYear;
      if (!targetYears.includes(year)) targetYears.push(year);
      attempts++;
    }

    const fetchNYTYear = async (year: number): Promise<any[]> => {
      const beginDateStr = `${year}${mm}01`;
      const endDateStr = `${year}${mm}28`;
      const params = new URLSearchParams({
        q: scienceQuery,
        'api-key': NYT_API_KEY,
        begin_date: beginDateStr,
        end_date: endDateStr,
        sort: 'relevance',
        fl: 'headline,abstract,pub_date,web_url',
      });
      try {
        let res = await fetch(
          `https://api.nytimes.com/svc/search/v2/articlesearch.json?${params}`,
          { headers: { Accept: 'application/json' } }
        );
        if (res.status === 429) {
          console.warn(`[OnThisDay] API 429 rate limit. Backing off 8 seconds...`);
          await new Promise(r => setTimeout(r, 8000));
          res = await fetch(
            `https://api.nytimes.com/svc/search/v2/articlesearch.json?${params}`,
            { headers: { Accept: 'application/json' } }
          );
        }
        if (!res.ok) return [];
        const data = await res.json();
        return (data.response?.docs as any[]) || [];
      } catch { return []; }
    };

    // Process sequentially with a delay to avoid rate limit spikes
    const histEvents: any[] = [];
    for (const year of targetYears) {
      const docs = await fetchNYTYear(year);
      const best = docs.find((d: any) => d.headline?.main && d.abstract && d.abstract.length > 20);
      if (best) {
        const pubYear = new Date(best.pub_date).getFullYear();
        const headline = best.headline.main as string;
        const abstract = (best.abstract as string).replace(/\s+/g, ' ').trim();
        const text = abstract.length > 20 ? `${headline}. ${abstract}` : headline;
        histEvents.push({
          id: `HIST-${pubYear}-${Math.random().toString(36).substr(2, 5)}`,
          year: pubYear,
          text: text.substring(0, 400),
          pageUrl: best.web_url || null,
        });
      }
      await new Promise(res => setTimeout(res, 300));
    }

    histEvents.sort((a, b) => Number(a.year) - Number(b.year));
    console.log(`[OnThisDay] Got ${histEvents.length} NYT events for ${mm}/${dd}.`);

    results.historyEvents = histEvents.length >= 1 ? histEvents : FALLBACK_EVENTS;
  } catch (e) {
    console.error('History (NYT) pipeline error:', e);
    results.historyEvents = FALLBACK_EVENTS;
  }

  return results;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const liveData = await fetchLiveData(body.topics);

    let dispatchStatus = "Not attempted (Automated run)";
    let dispatchError = null;

    // If this is NOT an automated run, trigger the GitHub Action for the podcast
    if (!body.isAutomated) {
      const githubToken = process.env.GITHUB_TOKEN;
      const repoOwner = "Nonsensical1";
      const repoName = "evoscout";
      
      if (githubToken) {
        console.log(`[GitHub Trigger] Initiating dispatch for ${repoOwner}/${repoName}...`);
        dispatchStatus = `Triggering GitHub Podcast Worker for ${repoOwner}/${repoName}...`;
        try {
          const dispatchRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/dispatches`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${githubToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
              'User-Agent': 'EvoScout-App'
            },
            body: JSON.stringify({
              event_type: 'manual-trigger'
            })
          });

          if (dispatchRes.ok) {
            dispatchStatus = "Success: GitHub Action triggered!";
          } else {
            const errText = await dispatchRes.text();
            dispatchStatus = `GitHub Trigger Failed: API returned ${dispatchRes.status}`;
            dispatchError = errText;
            console.error(`[GitHub Trigger] Error: ${dispatchRes.status} - ${errText}`);
          }
        } catch (e: any) {
          dispatchStatus = "Failed: Network error triggering GitHub Action.";
          dispatchError = e.message;
        }
      } else {
        dispatchStatus = "Incomplete: Missing GITHUB_TOKEN environment variable in Vercel.";
        console.warn(dispatchStatus);
      }
    }

    return NextResponse.json({
      success: true,
      liveData,
      dispatch_status: dispatchStatus,
      dispatch_error: dispatchError
    });
  } catch (err: any) {
    console.error("Scraper Proxy Error:", err);
    return NextResponse.json({ error: "Pipeline Failure", msg: err.message }, { status: 500 });
  }
}
