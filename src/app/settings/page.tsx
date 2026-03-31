"use client";

import { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw } from 'lucide-react';
import { useAuth } from '@/app/providers';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function SettingsPage() {
  const { user } = useAuth();
  const [limits, setLimits] = useState({ newsLimit: 50, literatureLimit: 50, grantsLimit: 50 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    async function loadSettings() {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid, 'settings', 'config'));
        if (snap.exists()) {
          setLimits({
            newsLimit: snap.data().newsLimit || 50,
            literatureLimit: snap.data().literatureLimit || 50,
            grantsLimit: snap.data().grantsLimit || 50
          });
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
      await setDoc(doc(db, 'users', user.uid, 'settings', 'config'), limits, { merge: true });
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
            
            <div className="pt-6">
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

          <div className="bg-[#fafafa] p-6 border border-editorial-border flex flex-col justify-center text-center items-center">
             <div className="w-16 h-16 border-4 border-editorial-border rounded-full flex justify-center items-center mb-6">
                <span className="font-sans font-black text-xl italic">{limits.newsLimit + limits.literatureLimit + limits.grantsLimit}</span>
             </div>
             <h3 className="font-serif font-bold text-xl mb-4">Daily Extraction Payload</h3>
             <p className="text-sm font-sans text-editorial-muted">This represents the maximum theoretical throughput the parsing engine will inject into your daily briefing. Note that true volume fluctuates based on global research output and pipeline availability.</p>
          </div>

        </div>
      </div>
    </div>
  );
}
