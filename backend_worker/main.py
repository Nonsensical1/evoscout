import os
import json
import asyncio
import requests
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore, storage, auth
from google.cloud import texttospeech
from google.oauth2 import service_account
from pydub import AudioSegment
from urllib.parse import quote

def setup_firebase():
    firebase_creds_json = os.environ.get('FIREBASE_SERVICE_ACCOUNT')
    if not firebase_creds_json:
        raise ValueError("Missing FIREBASE_SERVICE_ACCOUNT")
    
    cred_dict = json.loads(firebase_creds_json)
    cred = credentials.Certificate(cred_dict)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred, {
            'storageBucket': 'evoscout-bd7d1.firebasestorage.app'
        })
    
    # Also create TTS client using the same service account
    tts_creds = service_account.Credentials.from_service_account_info(cred_dict)
    tts_client = texttospeech.TextToSpeechClient(credentials=tts_creds)
    
    return firestore.client(), storage.bucket(), tts_client

def generate_podcast_script(news, lit, grants, duration_minutes=5):
    api_key = os.environ.get('GEMINI_API_KEY')
    
    safe_news = news[:4] if news else []
    safe_lit = lit[:3] if lit else []
    safe_grants = grants[:2] if grants else []
    
    # Scale word count to match target duration (~150 words per minute of speech)
    target_words = duration_minutes * 150
    
    prompt = f"""
    You are writing a ~{duration_minutes}-minute dynamic podcast script based on today's biological advancements.
    The podcast features two hosts: 'Alex' (male) and 'Sarah' (female).
    They are energetic, natural, banter a lot, and deeply analyze the science.
    
    Make the script thorough (around {target_words} words total across all lines).
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
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    res = requests.post(url, json={
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"}
    })
    
    if not res.ok:
        raise Exception(f"Gemini REST API Error: {res.status_code} {res.text}")
    
    data = res.json()
    raw_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "[]")
    
    return json.loads(raw_text.strip())

def generate_audio_segments(tts_client, script):
    """Use Google Cloud TTS Neural2 voices — free tier 1M chars/month."""
    files = []
    
    voice_map = {
        "Alex": texttospeech.VoiceSelectionParams(
            language_code="en-US",
            name="en-US-Neural2-J",  # Male
        ),
        "Sarah": texttospeech.VoiceSelectionParams(
            language_code="en-US",
            name="en-US-Neural2-F",  # Female
        ),
    }
    
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=1.05,  # Slightly faster for a natural podcast feel
        pitch=0.0,
    )
    
    for i, line in enumerate(script):
        speaker = line.get('speaker', 'Alex')
        text = line.get('text', '')
        if not text.strip():
            continue
        
        voice = voice_map.get(speaker, voice_map["Alex"])
        
        synthesis_input = texttospeech.SynthesisInput(text=text)
        response = tts_client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config,
        )
        
        filepath = f"/tmp/segment_{i}.mp3"
        with open(filepath, "wb") as out:
            out.write(response.audio_content)
        files.append(filepath)
        print(f"  Synthesized segment {i} ({speaker}: {len(text)} chars)")
    
    return files

def merge_audio(files, output_path):
    final_audio = AudioSegment.empty()
    crossfade_ms = 80
    for f in files:
        seg = AudioSegment.from_mp3(f)
        if len(final_audio) > 0:
            final_audio = final_audio.append(seg, crossfade=min(len(final_audio), len(seg), crossfade_ms))
        else:
            final_audio += seg
    final_audio.export(output_path, format="mp3")

def main():
    try:
        db, bucket, tts_client = setup_firebase()
    except Exception as e:
        print("Failed to setup firebase:", e)
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
            # Look up user email via Firebase Auth
            user_record = auth.get_user(user.id)
            user_email = user_record.email or ""
            print(f"  Email: {user_email}")
        except Exception:
            user_email = ""
        
        # Check user settings for custom TTS credentials and podcast preferences
        settings_ref = db.collection('users').document(user.id).collection('settings').document('config')
        settings_snap = settings_ref.get()
        user_settings = settings_snap.to_dict() if settings_snap.exists else {}
        
        custom_tts_json = user_settings.get('googleCloudTtsCredentials', None)
        is_admin = (user_email == "elijahryal@gmail.com")
        has_custom_tts = bool(custom_tts_json)
        
        # Determine podcast duration tier
        if is_admin or has_custom_tts:
            duration_minutes = 15
        else:
            duration_minutes = 5
        
        # If user has their own Google Cloud TTS credentials, create a dedicated client
        if has_custom_tts:
            try:
                user_creds = service_account.Credentials.from_service_account_info(json.loads(custom_tts_json))
                user_tts_client = texttospeech.TextToSpeechClient(credentials=user_creds)
                print(f"  Using custom TTS credentials (15-min tier)")
            except Exception as e:
                print(f"  Custom TTS creds invalid, falling back to default: {e}")
                user_tts_client = tts_client
                if not is_admin:
                    duration_minutes = 5
        else:
            user_tts_client = tts_client
        
        print(f"  Podcast tier: {duration_minutes}-minute generation")
            
        try:
            print("Generating podcast script from Gemini...")
            script = generate_podcast_script(news, lit, grants, duration_minutes=duration_minutes)
            print(f"Generated {len(script)} lines of dialogue.")
            
            # Synthesize with Google Cloud TTS
            print("Synthesizing audio with Google Cloud TTS Neural2 voices...")
            files = generate_audio_segments(user_tts_client, script)
            
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
            
            feed_ref.update({
                'podcastUrl': audio_url,
                'podcastScript': script
            })
            print(f"Podcast attached at {audio_url}")
            
        except Exception as e:
            print(f"Failed to generate/upload audio for {user.id}:", e)
            raise e

if __name__ == "__main__":
    main()
