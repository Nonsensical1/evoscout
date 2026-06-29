"use client";

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft, Clock } from 'lucide-react';
import { useAuth } from '@/app/providers';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Dynamically import the map to prevent SSR window/leaflet errors
const SurfMap = dynamic(() => import('@/components/SurfMap'), { ssr: false, loading: () => <div className="w-full h-[400px] flex items-center justify-center bg-gray-100 text-editorial-muted font-mono text-sm border border-editorial-border">Loading Map Interface...</div> });

interface SurfData {
  time: string;
  wave_height: number;
  wave_period: number;
  wave_direction: number;
}

interface SurfHistoryRecord {
  lat: number;
  lng: number;
  date: string;
}

export default function SurfPage() {
  const [data, setData] = useState<SurfData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [coords, setCoords] = useState<{lat: number, lng: number} | null>(null);
  const [history, setHistory] = useState<SurfHistoryRecord[]>([]);
  const { user } = useAuth();

  const saveToHistory = async (lat: number, lng: number) => {
    if (!user) return;
    
    setHistory(prev => {
        const filtered = prev.filter(h => h.lat !== lat || h.lng !== lng);
        const newRecord: SurfHistoryRecord = {
          lat,
          lng,
          date: new Date().toLocaleDateString()
        };
        const newHistory = [newRecord, ...filtered].slice(0, 10);
        
        const docRef = doc(db, 'users', user.uid);
        setDoc(docRef, { surf_history: newHistory }, { merge: true }).catch(e => console.error("Error saving surf history:", e));
        
        return newHistory;
    });
  };

  const handleLocationSelect = async (lat: number, lng: number, skipHistorySave = false) => {
    setCoords({ lat, lng });
    setLoading(true);
    setError("");
    setData(null);

    try {
      const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&hourly=wave_height,wave_period,wave_direction&timezone=auto`;
      const res = await fetch(url);
      
      if (!res.ok) {
         throw new Error("Unable to fetch marine data for these coordinates.");
      }

      const json = await res.json();
      
      if (!json.hourly || !json.hourly.wave_height) {
         throw new Error("No marine data available for this landmass/location.");
      }

      const today = new Date().toISOString().split('T')[0];
      const todayData: SurfData[] = [];

      for (let i = 0; i < json.hourly.time.length; i++) {
        // Only grab data for today
        if (json.hourly.time[i].startsWith(today) && json.hourly.wave_height[i] !== null) {
          todayData.push({
            time: new Date(json.hourly.time[i]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            wave_height: json.hourly.wave_height[i],
            wave_period: json.hourly.wave_period[i],
            wave_direction: json.hourly.wave_direction[i]
          });
        }
      }

      if (todayData.length === 0) {
        throw new Error("No marine data available for this location.");
      }

      setData(todayData);
      if (!skipHistorySave) {
        saveToHistory(lat, lng);
      }
    } catch (err: any) {
      setError(err.message || "An unknown error occurred.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      const fetchHistory = async () => {
        try {
          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.surf_history) {
              setHistory(data.surf_history);
              if (data.surf_history.length > 0) {
                // Auto-load most recent, skip saving to history since it's already there
                handleLocationSelect(data.surf_history[0].lat, data.surf_history[0].lng, true);
              }
            }
          }
        } catch (e) {
          console.error("Error fetching surf history:", e);
        }
      };
      fetchHistory();
    }
  }, [user]);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <Link href="/" className="inline-flex items-center gap-2 text-editorial-muted hover:text-editorial-text mb-8 transition-colors text-sm uppercase tracking-widest font-bold">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>
      
      <div className="mb-8 border-b border-editorial-border pb-4">
        <h1 className="text-4xl font-serif font-black tracking-tight text-editorial-text uppercase mb-2">
          Global Surf Conditions
        </h1>
        <p className="text-editorial-muted font-mono text-sm max-w-2xl">
          SELECT COORDINATES ON THE MAP TO QUERY MARINE DATABASE
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
         <div>
            <SurfMap onLocationSelect={handleLocationSelect} selectedCoords={coords} />
         </div>

         <div className="bg-editorial-paper border border-editorial-border shadow-sm min-h-[400px] p-6 font-mono text-sm">
            {loading && (
              <div className="h-full flex flex-col items-center justify-center text-editorial-muted space-y-2">
                 <div className="animate-pulse">QUERYING METEO MARINE API...</div>
                 {coords && <div>LAT: {coords.lat.toFixed(4)} | LNG: {coords.lng.toFixed(4)}</div>}
              </div>
            )}
            
            {!loading && error && (
              <div className="h-full flex flex-col items-center justify-center text-red-600">
                 <div>[ERROR] {error}</div>
              </div>
            )}

            {!loading && !error && !data && (
              <div className="h-full flex flex-col items-center justify-center text-editorial-muted">
                 <div>AWAITING USER INPUT</div>
              </div>
            )}

            {!loading && data && coords && (
               <div>
                  <div className="mb-6 pb-2 border-b border-editorial-border-dark flex justify-between">
                     <span>TARGET: LAT {coords.lat.toFixed(4)}, LNG {coords.lng.toFixed(4)}</span>
                     <span>DATE: {new Date().toLocaleDateString()}</span>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-editorial-border-dark text-editorial-muted">
                          <th className="py-2 font-normal">TIME</th>
                          <th className="py-2 font-normal">HEIGHT (m)</th>
                          <th className="py-2 font-normal">PERIOD (s)</th>
                          <th className="py-2 font-normal">DIR (°)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((row, idx) => (
                          <tr key={idx} className="border-b border-editorial-border hover:bg-gray-50 transition-colors">
                            <td className="py-2">{row.time}</td>
                            <td className="py-2">{row.wave_height.toFixed(2)}</td>
                            <td className="py-2">{row.wave_period.toFixed(1)}</td>
                            <td className="py-2">{row.wave_direction}°</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               </div>
            )}
         </div>
      </div>
      
      {history.length > 0 && (
         <div className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-widest text-editorial-text mb-4 flex items-center gap-2 border-b border-editorial-border pb-2">
               <Clock className="w-4 h-4" /> Recent Locations
            </h2>
            <div className="flex gap-4 flex-wrap">
               {history.map((record, idx) => (
                  <button
                     key={idx}
                     onClick={() => handleLocationSelect(record.lat, record.lng)}
                     className="px-4 py-2 border border-editorial-border bg-editorial-bg text-xs font-mono hover:bg-editorial-border/30 transition-colors text-left"
                  >
                     <div className="text-editorial-text">LAT {record.lat.toFixed(4)}</div>
                     <div className="text-editorial-text">LNG {record.lng.toFixed(4)}</div>
                     <div className="text-editorial-muted mt-1">{record.date}</div>
                  </button>
               ))}
            </div>
         </div>
      )}
    </div>
  );
}
