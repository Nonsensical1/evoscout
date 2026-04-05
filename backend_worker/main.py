import os
import json
import uuid
import random
import asyncio
import requests
import feedparser
from datetime import datetime, timedelta
import firebase_admin
from firebase_admin import credentials, firestore, storage
import google.generativeai as genai
import edge_tts
from pydub import AudioSegment

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

def scrape_grants(topics):
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    today = datetime.utcnow()
    grants = []
    
    # Simple NSF
    try:
        nsf_res = requests.get(f"https://api.nsf.gov/services/v1/awards.json?keyword=biology&printFields=id,title,awardeeName,fundsObligatedAmt&dateStart={thirty_days_ago.strftime('%m/%d/%Y')}").json()
        for a in nsf_res.get('response', {}).get('award', [])[:5]:
            grants.append({
                'id': f"NSF-{a.get('id')}",
                'title': a.get('title'),
                'agency': a.get('awardeeName', 'NSF'),
                'amount': f"${int(a.get('fundsObligatedAmt', 0)):,}",
                'url': f"https://www.nsf.gov/awardsearch/showAward?AWD_ID={a.get('id')}"
            })
    except Exception as e:
        print("NSF Error", e)

    # Simple NIH
    try:
        nih_payload = {
            "criteria": {
                "advanced_text_search": {"search_text": "biology"},
                "project_start_date": {"from_date": thirty_days_ago.strftime('%Y-%m-%d'), "to_date": today.strftime('%Y-%m-%d')}
            },
            "limit": 5
        }
        nih_res = requests.post("https://api.reporter.nih.gov/v2/projects/search", json=nih_payload).json()
        for a in nih_res.get('results', []):
            grants.append({
                'id': f"NIH-{a.get('appl_id')}",
                'title': a.get('project_title'),
                'agency': a.get('organization', {}).get('org_name', 'NIH'),
                'amount': f"${int(a.get('award_amount', 0)):,}" if a.get('award_amount') else "N/A",
                'url': a.get('project_detail_url', '')
            })
    except Exception as e:
        print("NIH Error", e)

    random.shuffle(grants)
    return grants[:12], []

def scrape_news(topics, pexels_key):
    feeds = [
        {'url': 'https://www.nature.com/nature.rss', 'source': 'Nature'},
        {'url': 'https://www.science.org/rss/news_current.xml', 'source': 'Science Mag'},
        {'url': 'https://phys.org/rss-feed/biology-news/', 'source': 'Phys.org'},
        {'url': 'https://www.cell.com/cell/inpress.rss', 'source': 'Cell Press'}
    ]
    news = []
    for f in feeds:
        try:
            parsed = feedparser.parse(f['url'])
            for entry in parsed.entries[:5]:
                image = None
                # Native thumbnail check
                if 'media_thumbnail' in entry and len(entry.media_thumbnail) > 0:
                    image = entry.media_thumbnail[0]['url'].replace('/tmb/', '/800w/')
                
                if not image and pexels_key:
                    try:
                        q = entry.get('title', '').split(' ')[0] + " science"
                        pex_res = requests.get(f"https://api.pexels.com/v1/search?query={q}&per_page=1&size=large&orientation=landscape", headers={"Authorization": pexels_key}).json()
                        if pex_res.get('photos'):
                            image = pex_res['photos'][0]['src']['original']
                    except: pass

                if not image:
                    image = "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?ixlib=rb-1.2.1&auto=format&fit=crop&w=2560&q=100"

                news.append({
                    'id': f"NEWS-{uuid.uuid4().hex[:6]}",
                    'title': entry.get('title', ''),
                    'source': f['source'],
                    'url': entry.get('link', ''),
                    'image': image,
                    'summary': entry.get('summary', '')[:200] + "..."
                })
        except Exception as e:
            print(f"Feed error {f['source']}: {e}")
            
    random.shuffle(news)
    return news[:12]

def scrape_literature(topics):
    lit = []
    try:
        start = (datetime.utcnow() - timedelta(days=2)).strftime('%Y-%m-%d')
        end = datetime.utcnow().strftime('%Y-%m-%d')
        res = requests.get(f"https://api.biorxiv.org/details/biorxiv/{start}/{end}").json()
        if 'collection' in res:
            papers = res['collection']
            random.shuffle(papers)
            for p in papers[:12]:
                lit.append({
                    'id': f"LIT-{p.get('doi')}",
                    'title': p.get('title', ''),
                    'authors': p.get('authors', 'Various'),
                    'journal': 'bioRxiv',
                    'doi': p.get('doi', ''),
                    'summary': p.get('abstract', '')[:250] + "..."
                })
    except Exception as e:
        print("Literature Error", e)
    return lit

def scrape_positions():
    # Mocking standard evergreen return
    return [{
       'id': f"PORTAL-{uuid.uuid4().hex[:6]}",
       'title': "Broad Institute",
       'institution': "Cambridge, MA",
       'location': "Cambridge, MA",
       'url': "https://broadinstitute.wd1.myworkdayjobs.com/broad_institute_careers?q=biology",
       'dateAdded': datetime.utcnow().isoformat()
    }]

def generate_podcast_script(news, lit, grants):
    genai.configure(api_key=os.environ.get('GEMINI_API_KEY'))
    model = genai.GenerativeModel('gemini-1.5-flash')
    
    prompt = f"""
    You are writing a ~10-minute dynamic podcast script based on today's biological advancements.
    The podcast features two hosts: 'Alex' (male) and 'Sarah' (female).
    They are energetic, natural, banter a lot, and deeply analyze the science.
    
    Make the script exceptionally long and thorough (around 1500+ words).
    Use the following news, literature, and grants for material:
    NEWS: {json.dumps(news[:5])}
    LIT: {json.dumps(lit[:5])}
    GRANTS: {json.dumps(grants[:3])}
    
    Return EXACTLY a pure JSON array containing the dialogue, with NO markdown formatting, like this:
    [
      {{"speaker": "Alex", "text": "Welcome back to the Deep Dive..."}},
      {{"speaker": "Sarah", "text": "That's right, today we're looking at..."}}
    ]
    """
    
    res = model.generate_content(prompt)
    raw_text = res.text.strip()
    if raw_text.startswith("```json"):
        raw_text = raw_text.replace("```json", "", 1).replace("```", "")
    return json.loads(raw_text)

async def generate_audio_segments(script):
    files = []
    # edge-tts voices: (Alex -> GuyNeural, Sarah -> AriaNeural)
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
            # Crossfade slightly for natural interruption buffer
            final_audio = final_audio.append(seg, crossfade=min(len(final_audio), len(seg), combined_crossfade))
        else:
            final_audio += seg
    
    final_audio.export(output_path, format="mp3")

def main():
    try:
        db, bucket = setup_firebase()
    except Exception as e:
        print("Failed to setup firebase:", e)
        return

    users = db.collection('users').stream()
    
    for user in users:
        print(f"Processing user {user.id}...")
        settings_ref = db.collection('users').document(user.id).collection('settings').document('config')
        settings = settings_ref.get().to_dict() or {}
        topics = settings.get('topics', {})
        
        pexels_key = os.environ.get('PEXELS_API_KEY', "c5w6mctmy3dgyaA69iUsDjgccGUojIlKEa3Y8JtsLU2yJm2HUp2gjQy6")
        
        # Scrape
        news = scrape_news(topics, pexels_key)
        lit = scrape_literature(topics)
        grants, gov = scrape_grants(topics)
        pos = scrape_positions()
        
        # Build liveData
        liveData = {
            'date': datetime.utcnow().strftime('%Y-%m-%d'),
            'news': news,
            'literature': lit,
            'grants': grants,
            'openGovGrants': gov,
            'positions': pos,
            'lastScrapeTimestamp': datetime.utcnow().isoformat()
        }
        
        # Generate Podcast Script
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
            
            # Make public or construct standard alt=media URL
            blob.make_public()
            # fallback to explicit tokenized url if necessary, but make_public provides public_url
            audio_url = blob.public_url
            
            liveData['podcastUrl'] = audio_url
            liveData['podcastScript'] = script
            print(f"Podcast available at {audio_url}")
            
        except Exception as e:
            print("Failed to generate/upload audio:", e)
        
        # Update Firestore Daily Feed
        db.collection('users').document(user.id).collection('daily').document('feed').set(liveData)
        print(f"Data pushed to database for {user.id}")

if __name__ == "__main__":
    main()
