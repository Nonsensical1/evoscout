"use client";

import { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, Cloud } from 'lucide-react';
import { useAuth } from '@/app/providers';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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
  const [ttsCredentials, setTtsCredentials] = useState('');
  const [ttsEngine, setTtsEngine] = useState('kokoro');

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
          if (snap.data().googleCloudTtsCredentials) {
            setTtsCredentials(snap.data().googleCloudTtsCredentials);
          }
          if (snap.data().ttsEngine) {
            setTtsEngine(snap.data().ttsEngine);
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
        ...(ttsCredentials ? { googleCloudTtsCredentials: ttsCredentials } : {})
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

      <div className="bg-white border-2 border-editorial-border p-8 md:p-12 relative overflow-hidden">
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
        <div className="bg-[#fafafa] p-6 border border-editorial-border flex flex-col justify-center text-center items-center">
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
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
          
          {/* PODCAST TTS TIER */}
          <div className="mt-16 pt-10 border-t-2 border-editorial-border-dark">
            <div className="flex items-center gap-3 mb-2">
              <Cloud className="w-6 h-6 text-[#005587]" />
              <h2 className="text-2xl font-bold uppercase tracking-widest inline-block pb-1">AI Voice Engine</h2>
            </div>
            <p className="text-sm font-sans text-editorial-muted mt-2 mb-6">
              Select the core technology used to synthesize your podcast hosts. 
            </p>

            <div className="space-y-4 mb-10">
              <label className="flex items-start gap-3 p-4 border border-editorial-border cursor-pointer hover:bg-gray-50 transition-colors">
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

              <label className="flex items-start gap-3 p-4 border border-editorial-border cursor-pointer hover:bg-gray-50 transition-colors">
                <input 
                  type="radio" 
                  name="ttsEngine" 
                  value="fish" 
                  checked={ttsEngine === 'fish'} 
                  onChange={(e) => setTtsEngine(e.target.value)}
                  className="mt-1 accent-editorial-text w-4 h-4"
                />
                <div>
                  <span className="block font-bold font-sans uppercase tracking-wider text-sm">Fish Speech S2-Pro (ZeroGPU)</span>
                  <span className="text-sm font-sans text-editorial-muted mt-1 block">Zero-Shot clones your exact custom Al.mp3 and Matt.mp3 files. Highly subject to API rate limits and duration caps.</span>
                </div>
              </label>
            </div>

            <h3 className="text-xl font-bold uppercase tracking-widest inline-block pb-1 mb-2">Podcast Generation Capacity</h3>
            <p className="text-sm font-sans text-editorial-muted mt-2 mb-6">
              By default, your AI Deep Dive podcast is generated as a short-form summary. 
              To unlock <strong>15-minute</strong> extended episodes, link a billing account below. 
            </p>

            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <label className="font-bold font-sans uppercase tracking-wider text-sm">Google Cloud Service Account JSON</label>
                <textarea
                  value={ttsCredentials}
                  onChange={(e) => setTtsCredentials(e.target.value)}
                  placeholder='Paste your full service account JSON here (e.g. {"type": "service_account", "project_id": "...", ...})'
                  rows={4}
                  className="p-3 border border-editorial-border font-mono text-xs focus:outline-editorial-text w-full resize-y bg-white"
                />
                <p className="text-xs font-sans text-editorial-muted">
                  Generate at <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" className="underline text-[#005587]">Google Cloud Console</a>. 
                  Ensure <strong>Cloud Text-to-Speech API</strong> is enabled on your project.
                </p>
              </div>

              {ttsCredentials && (
                <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 text-green-800 text-sm font-sans">
                  <Cloud className="w-4 h-4" />
                  <span>Custom credentials linked — your podcast will generate at the <strong>15-minute extended tier</strong>.</span>
                </div>
              )}

              {!ttsCredentials && (
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border border-gray-200 text-gray-500 text-sm font-sans">
                  <Cloud className="w-4 h-4" />
                  <span>No custom credentials — podcast generates at the standard <strong>5-minute tier</strong>.</span>
                </div>
              )}
            </div>
          </div>

          {/* Submit Button Resituated */}
          <div className="pt-6 border-t border-editorial-border">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-editorial-text hover:bg-black text-white py-4 flex justify-center items-center gap-3 font-sans font-bold uppercase tracking-widest transition-colors disabled:opacity-70"
            >
              {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {saving ? 'Transmitting...' : 'Commit Configuration'}
            </button>
            {successMsg && (
              <p className="text-center font-sans font-bold text-[#005587] text-sm mt-4 uppercase tracking-widest">
                {successMsg}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
