import os
import json
import asyncio
import requests
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore, storage
import edge_tts
from pydub import AudioSegment
from urllib.parse import quote

def setup_firebase():
    firebase_creds_json = os.environ.get('FIREBASE_SERVICE_ACCOUNT')
    if not firebase_creds_json:
        raise ValueError("Missing FIREBASE_SERVICE_ACCOUNT")
    
    cred = credentials.Certificate(json.loads(firebase_creds_json))
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred, {
            'storageBucket': 'evoscout-bd7d1.firebasestorage.app'
        })
    return firestore.client(), storage.bucket()

def generate_podcast_script(news, lit, grants):
    api_key = os.environ.get('GEMINI_API_KEY')
    
    # Restrict arrays slightly to save tokens context window
    safe_news = news[:4] if news else []
    safe_lit = lit[:3] if lit else []
    safe_grants = grants[:2] if grants else []
    
    prompt = f"""
    You are writing a ~5 to 10-minute dynamic podcast script based on today's biological advancements.
    The podcast features two hosts: 'Alex' (male) and 'Sarah' (female).
    They are energetic, natural, banter a lot, and deeply analyze the science.
    
    Make the script thorough (around 1000 words).
    Use the following news, literature, and grants for material:
    NEWS: {json.dumps(safe_news)}
    LIT: {json.dumps(safe_lit)}
    GRANTS: {json.dumps(safe_grants)}
    
    Return EXACTLY a pure JSON array containing the dialogue, with NO markdown formatting, like this:
    [
      {{"speaker": "Alex", "text": "Welcome back to the Deep Dive..."}},
      {{"speaker": "Sarah", "text": "That's right, today we're looking at..."}}
    ]
    """
    
    # Use the exact same REST endpoint that works in the Next.js aggregator
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    res = requests.post(url, json={
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"}
    })
    
    if not res.ok:
        raise Exception(f"Gemini REST API Error: {res.status_code} {res.text}")
    
    data = res.json()
    raw_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "[]")
    
    return json.loads(raw_text.strip())

async def generate_audio_segments(script):
    files = []
    voice_map = {
        "Alex": "en-US-GuyNeural",
        "Sarah": "en-US-AriaNeural"
    }
    
    for i, line in enumerate(script):
        speaker = line.get('speaker', 'Alex')
        text = line.get('text', '')
        voice = voice_map.get(speaker, "en-US-GuyNeural")
        
        filepath = f"/tmp/segment_{i}.mp3"
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(filepath)
        files.append(filepath)
    
    return files

def merge_audio(files, output_path):
    final_audio = AudioSegment.empty()
    combined_crossfade = 100 # ms
    for f in files:
        seg = AudioSegment.from_mp3(f)
        if len(final_audio) > 0:
            final_audio = final_audio.append(seg, crossfade=min(len(final_audio), len(seg), combined_crossfade))
        else:
            final_audio += seg
    final_audio.export(output_path, format="mp3")

def main():
    try:
        db, bucket = setup_firebase()
    except Exception as e:
        print("Failed to setup firebase credentials (Did you create the FIREBASE_SERVICE_ACCOUNT secret?)", e)
        raise e

    users = db.collection('users').stream()
    
    for user in users:
        print(f"Checking user {user.id} for podcast generation...")
        feed_ref = db.collection('users').document(user.id).collection('daily').document('feed')
        feed_snap = feed_ref.get()
        
        if not feed_snap.exists:
            print(f"Skipping {user.id} - No daily feed established yet.")
            continue
            
        feed_data = feed_snap.to_dict()
        
        # If the podcast is already generated for this exact feed instance, skip it to save costs!
        if 'podcastUrl' in feed_data and feed_data.get('podcastUrl'):
            print(f"Skipping {user.id} - Podcast already generated.")
            continue
            
        news = feed_data.get('news', [])
        lit = feed_data.get('literature', [])
        grants = feed_data.get('grants', [])
        
        if not news and not lit:
            print(f"Skipping {user.id} - Insufficient data for a podcast.")
            continue
            
        try:
            print("Generating podcast script from Gemini...")
            script = generate_podcast_script(news, lit, grants)
            print(f"Generated {len(script)} lines of dialogue.")
            
            # Synthesize
            loop = asyncio.get_event_loop()
            files = loop.run_until_complete(generate_audio_segments(script))
            
            # Merge
            master_mp3 = f"/tmp/master_{user.id}.mp3"
            print("Merging audio segments...")
            merge_audio(files, master_mp3)
            
            # Upload
            print("Uploading to Firebase Storage...")
            blob_path = f"podcasts/{user.id}/{datetime.utcnow().strftime('%Y-%m-%d')}_deepdive.mp3"
            blob = bucket.blob(blob_path)
            blob.upload_from_filename(master_mp3, content_type='audio/mpeg')
            
            audio_url = f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}/o/{quote(blob_path, safe='')}?alt=media"
            
            # Subtly inject ONLY the podcast payload via update() to leave their quotas and data entirely untouched!
            feed_ref.update({
                'podcastUrl': audio_url,
                'podcastScript': script
            })
            print(f"Podcast attached natively at {audio_url}")
            
        except Exception as e:
            print(f"Failed to generate/upload audio for {user.id}:", e)
            raise e

if __name__ == "__main__":
    main()
