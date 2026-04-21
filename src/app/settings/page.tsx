"use client";

import { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, Cloud } from 'lucide-react';
import { useAuth } from '@/app/providers';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useTheme } from 'next-themes';

export default function SettingsPage() {
  const { user } = useAuth();
  const [limits, setLimits] = useState({ newsLimit: 12, literatureLimit: 12, grantsLimit: 12 });
  const [topics, setTopics] = useState({
    grants: "",
    openGovGrants: "",
    news: "",
    literature: "",
    careerInstitutions: "",
    careerTitles: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [ttsEngine, setTtsEngine] = useState('kokoro');
  const [customModalUrl, setCustomModalUrl] = useState('');
  const [modalQuotaExceededMonth, setModalQuotaExceededMonth] = useState<number | null>(null);

  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    async function loadSettings() {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid, 'settings', 'config'));
        if (snap.exists()) {
          setLimits({
            newsLimit: snap.data().newsLimit || 12,
            literatureLimit: snap.data().literatureLimit || 12,
            grantsLimit: snap.data().grantsLimit || 12
          });
          const tops = snap.data().topics || {};
          setTopics({
            grants: tops.grants || "",
            openGovGrants: tops.openGovGrants || "",
            news: tops.news || "",
            literature: tops.literature || "",
            careerInstitutions: tops.careerInstitutions || "",
            careerTitles: tops.careerTitles || ""
          });
          if (snap.data().ttsEngine) {
            setTtsEngine(snap.data().ttsEngine);
          }
          if (snap.data().customModalUrl) {
            setCustomModalUrl(snap.data().customModalUrl);
          }
          if (snap.data().modalQuotaExceededMonth !== undefined) {
            setModalQuotaExceededMonth(snap.data().modalQuotaExceededMonth);
          }
          if (snap.data().theme) {
            setTheme(snap.data().theme);
          }
        }
      } catch (e) {
        console.error("Error loading settings", e);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', user.uid, 'settings', 'config'), {
        ...limits,
        topics,
        ttsEngine,
        customModalUrl,
        theme
      }, { merge: true });
      setSuccessMsg("Configuration committed successfully.");
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      console.error(e);
      setSuccessMsg("Error saving configuration.");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setLimits(prev => ({
      ...prev,
      [e.target.name]: isNaN(val) ? 0 : val > 50 ? 50 : val < 1 ? 1 : val
    }));
  };

  const handleTopicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTopics(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 font-serif italic text-editorial-muted">
        Loading configuration parameters...
      </div>
    );
  }

  const currentMonth = new Date().getMonth() + 1;
  const isModalLocked = modalQuotaExceededMonth === currentMonth;

  return (
    <div className="max-w-4xl mx-auto font-serif">
      <div className="border-b-4 border-editorial-border pb-6 mb-10 flex flex-col md:flex-row justify-between items-baseline gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-editorial-text mb-2 flex items-center gap-4">
            <Settings className="w-10 h-10" />
            Control Desk
          </h1>
          <p className="text-editorial-muted italic text-lg line-clamp-2 md:line-clamp-none">
            Adjust maximum daily extraction thresholds and AI routing parameters for your feed. Limits cannot exceed 50.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-[#121212] border-2 border-editorial-border p-8 md:p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="space-y-10">
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-widest mb-2 border-b-2 border-editorial-border-dark inline-block pb-1">Aggregation Quotas</h2>
              <p className="text-sm font-sans text-editorial-muted mt-2 mb-6">Specify the algorithmic threshold for payload injection arrays. Decreasing limits increases engine velocity.</p>

              <div className="space-y-6">
                <div className="flex flex-col gap-2">
                  <label className="font-bold font-sans uppercase tracking-wider text-sm flex justify-between">
                    Science News Quota
                    <span className="text-editorial-muted">{limits.newsLimit} / 50</span>
                  </label>
                  <input
                    type="range"
                    name="newsLimit"
                    min="1" max="50"
                    value={limits.newsLimit}
                    onChange={handleChange}
                    className="w-full accent-editorial-text"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="font-bold font-sans uppercase tracking-wider text-sm flex justify-between">
                    Pre-Print Literature Quota
                    <span className="text-editorial-muted">{limits.literatureLimit} / 50</span>
                  </label>
                  <input
                    type="range"
                    name="literatureLimit"
                    min="1" max="50"
                    value={limits.literatureLimit}
                    onChange={handleChange}
                    className="w-full accent-editorial-text"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="font-bold font-sans uppercase tracking-wider text-sm flex justify-between">
                    Grant Retrieval Quota
                    <span className="text-editorial-muted">{limits.grantsLimit} / 50</span>
                  </label>
                  <input
                    type="range"
                    name="grantsLimit"
                    min="1" max="50"
                    value={limits.grantsLimit}
                    onChange={handleChange}
                    className="w-full accent-editorial-text"
                  />
                </div>
              </div>
            </div>
          </div>
        
          {/* RESTORED PAYLOAD METRICS */}
          <div className="bg-[#fafafa] dark:bg-[#1e1e1e] p-6 border border-editorial-border flex flex-col justify-center text-center items-center">
            <div className="w-16 h-16 border-4 border-editorial-border rounded-full flex justify-center items-center mb-6">
              <span className="font-sans font-black text-xl italic">{limits.newsLimit + limits.literatureLimit + limits.grantsLimit}</span>
            </div>
            <h3 className="font-serif font-bold text-xl mb-4">Daily Extraction Payload</h3>
            <p className="text-sm font-sans text-editorial-muted">This represents the maximum theoretical throughput the parsing engine will inject into your daily briefing.</p>
          </div>
        </div>

        {/* ALGORITHMIC SETTINGS */}
        <div className="mt-16 pt-10 border-t-2 border-editorial-border-dark">
            <h2 className="text-2xl font-bold uppercase tracking-widest mb-2 inline-block pb-1">Algorithmic Routing Parameters</h2>
            <p className="text-sm font-sans text-editorial-muted mt-2 mb-8">Override the core scraping AI. Input comma-separated keywords or leave exactly blank to inherit default parameters.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="flex flex-col gap-2">
                 <label className="font-bold font-sans uppercase tracking-wider text-sm">NSF / NIH Grants</label>
                 <input name="grants" value={topics.grants} onChange={handleTopicChange} placeholder="e.g. genomics, pathology, epigenetics" className="p-3 border border-editorial-border font-sans text-sm focus:outline-editorial-text w-full" />
              </div>
              <div className="flex flex-col gap-2">
                 <label className="font-bold font-sans uppercase tracking-wider text-sm">GovGrants Open Pipeline</label>
                 <input name="openGovGrants" value={topics.openGovGrants} onChange={handleTopicChange} placeholder="e.g. molecular biology, bioinformatics" className="p-3 border border-editorial-border font-sans text-sm focus:outline-editorial-text w-full" />
              </div>
              <div className="flex flex-col gap-2">
                 <label className="font-bold font-sans uppercase tracking-wider text-sm">Global Web News</label>
                 <input name="news" value={topics.news} onChange={handleTopicChange} placeholder="e.g. CRISPR, Cas9, quantum computing" className="p-3 border border-editorial-border font-sans text-sm focus:outline-editorial-text w-full" />
              </div>
              <div className="flex flex-col gap-2">
                 <label className="font-bold font-sans uppercase tracking-wider text-sm">Pre-Print Literature</label>
                 <input name="literature" value={topics.literature} onChange={handleTopicChange} placeholder="e.g. synthetic biology, oncology" className="p-3 border border-editorial-border font-sans text-sm focus:outline-editorial-text w-full" />
              </div>
              <div className="flex flex-col gap-2">
                 <label className="font-bold font-sans uppercase tracking-wider text-sm">Career Targets (Institutions)</label>
                 <input name="careerInstitutions" value={topics.careerInstitutions} onChange={handleTopicChange} placeholder="e.g. NIH, Broad Institute, SpaceX" className="p-3 border border-editorial-border font-sans text-sm focus:outline-editorial-text w-full" />
              </div>
              <div className="flex flex-col gap-2">
                 <label className="font-bold font-sans uppercase tracking-wider text-sm">Career Targets (Job Titles)</label>
                 <input name="careerTitles" value={topics.careerTitles} onChange={handleTopicChange} placeholder="e.g. Software Engineer, Lab Tech" className="p-3 border border-editorial-border font-sans text-sm focus:outline-editorial-text w-full" />
              </div>
            </div>
        </div>
        
        {/* PODCAST TTS TIER */}
        <div className="mt-16 pt-10 border-t-2 border-editorial-border-dark">
          <div className="flex items-center gap-3 mb-2">
            <Cloud className="w-6 h-6 text-[#005587] dark:text-[#60a5fa]" />
            <h2 className="text-2xl font-bold uppercase tracking-widest inline-block pb-1">AI Voice Engine</h2>
          </div>
          <p className="text-sm font-sans text-editorial-muted mt-2 mb-6">
            Select the core technology used to synthesize your podcast hosts. 
          </p>

          <div className="space-y-4">
            <label className="flex items-start gap-3 p-4 border border-editorial-border cursor-pointer hover:bg-gray-50 dark:hover:bg-[#262626] transition-colors">
              <input 
                type="radio" 
                name="ttsEngine" 
                value="kokoro" 
                checked={ttsEngine === 'kokoro'} 
                onChange={(e) => setTtsEngine(e.target.value)}
                className="mt-1 accent-editorial-text w-4 h-4"
              />
              <div>
                <span className="block font-bold font-sans uppercase tracking-wider text-sm">Kokoro TTS (Default)</span>
                <span className="text-sm font-sans text-editorial-muted mt-1 block">100% Free, Unlimited duration. Uses ultra-realistic built-in studio broadcast voices (am_michael & am_adam).</span>
              </div>
            </label>

            <div className={`border border-editorial-border ${isModalLocked ? 'opacity-60 select-none bg-gray-50 dark:bg-[#1e1e1e]' : ''}`}>
              <label className={`flex items-start gap-3 p-4 transition-colors ${isModalLocked ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-[#262626]'}`}>
                <input 
                  type="radio" 
                  name="ttsEngine" 
                  value="fish" 
                  checked={ttsEngine === 'fish'} 
                  onChange={(e) => setTtsEngine(e.target.value)}
                  disabled={isModalLocked}
                  className="mt-1 accent-editorial-text w-4 h-4 disabled:bg-gray-300"
                />
                <div>
                  <span className="block font-bold font-sans uppercase tracking-wider text-sm">Fish Speech S2-Pro (Modal)</span>
                  <span className="text-sm font-sans text-editorial-muted mt-1 block">Zero-Shot clones your exact custom Al.mp3 and Matt.mp3 files. Requires linking your own Modal free-tier deployment.</span>
                  {isModalLocked && (
                    <span className="block mt-3 text-[10px] sm:text-xs font-sans font-bold text-red-600 uppercase tracking-widest border border-red-200 bg-white dark:bg-[#121212] p-2 text-center rounded-sm">
                      🔒 Locked: Modal Free Credits Exhausted Until Next Month
                    </span>
                  )}
                </div>
              </label>

              {ttsEngine === 'fish' && (
                <div className="p-4 bg-gray-50 dark:bg-[#1e1e1e] border-t border-editorial-border">
                  <label className="block font-bold font-sans uppercase tracking-wider text-xs mb-2">Modal Web Endpoint URL</label>
                  <input
                    type="text"
                    value={customModalUrl}
                    onChange={(e) => setCustomModalUrl(e.target.value)}
                    placeholder="https://your-workspace--fish-speech-app.modal.run"
                    className="w-full p-2 border border-editorial-border font-sans text-sm focus:outline-editorial-text"
                  />
                  <p className="text-xs font-sans text-editorial-muted mt-2">
                    Must route directly to your deployed <code>@modal.asgi_app()</code>. Example format above.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* THEME PREFERENCE */}
        <div className="mt-16 pt-10 border-t-2 border-editorial-border-dark">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold uppercase tracking-widest inline-block pb-1">Display Mode</h2>
          </div>
          <p className="text-sm font-sans text-editorial-muted mt-2 mb-6">
            Adjust the color scheme of the EvoScout dashboard.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <label className="flex items-center gap-3 p-4 border border-editorial-border cursor-pointer hover:bg-gray-50 dark:hover:bg-[#1e1e1e] transition-colors flex-1">
              <input
                type="radio"
                name="theme"
                value="system"
                checked={mounted && theme === 'system'}
                onChange={() => setTheme('system')}
                className="mt-1 accent-editorial-text w-4 h-4"
              />
              <div className="font-bold font-sans uppercase tracking-wider text-sm">System Default</div>
            </label>
            <label className="flex items-center gap-3 p-4 border border-editorial-border cursor-pointer hover:bg-gray-50 dark:hover:bg-[#1e1e1e] transition-colors flex-1">
              <input
                type="radio"
                name="theme"
                value="light"
                checked={mounted && theme === 'light'}
                onChange={() => setTheme('light')}
                className="mt-1 accent-editorial-text w-4 h-4"
              />
              <div className="font-bold font-sans uppercase tracking-wider text-sm">Light Mode</div>
            </label>
            <label className="flex items-center gap-3 p-4 border border-editorial-border cursor-pointer hover:bg-gray-50 dark:hover:bg-[#1e1e1e] transition-colors flex-1">
              <input
                type="radio"
                name="theme"
                value="dark"
                checked={mounted && theme === 'dark'}
                onChange={() => setTheme('dark')}
                className="mt-1 accent-editorial-text w-4 h-4"
              />
              <div className="font-bold font-sans uppercase tracking-wider text-sm">Dark Mode</div>
            </label>
          </div>
        </div>

        {/* Submit Button Resituated */}
        <div className="pt-8 mt-12 border-t border-editorial-border">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-editorial-text hover:bg-black text-white py-4 flex justify-center items-center gap-3 font-sans font-bold uppercase tracking-widest transition-colors disabled:opacity-70"
          >
            {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {saving ? 'Transmitting...' : 'Commit Configuration'}
          </button>
          {successMsg && (
            <p className="text-center font-sans font-bold text-[#005587] dark:text-[#60a5fa] text-sm mt-4 uppercase tracking-widest">
              {successMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
