import os
import json
import asyncio
import requests
import shutil
import time
from datetime import datetime, timedelta
import firebase_admin
from firebase_admin import credentials, firestore, storage, auth
from gradio_client import Client, handle_file
from pydub import AudioSegment
import re
from urllib.parse import quote
import soundfile as sf
import numpy as np

try:
    from kokoro_onnx import Kokoro
except ImportError:
    pass # Managed by requirements.txt

def parse_dialogue_fallback(raw_text):
    """
    Bulletproof string parser that relies on regex to find speakers and text.
    Bypasses json.loads entirely to prevent crashes from hallucinated syntax 
    (e.g. missing braces, unescaped quotes, trailing characters).
    """
    dialogue = []
    
    # Split the raw string by the literal '"speaker":' to get processing chunks
    chunks = raw_text.split('"speaker":')
    for chunk in chunks[1:]:
        # Extact speaker (find first quoted word)
        speaker_match = re.search(r'^\s*"([^"]+)"', chunk)
        if not speaker_match:
            continue
        speaker = speaker_match.group(1).strip()
        
        # Extract text block
        text_block_match = re.search(r'"text"\s*:\s*"(.*)', chunk, re.DOTALL)
        if not text_block_match:
            continue
            
        remaining_text = text_block_match.group(1)
        
        # Trim whitespace
        clean_text = remaining_text.strip()
        
        # Drop trailing structural characters that might be appended 
        # (like commas, closing braces, or brackets)
        while clean_text and clean_text[-1] in ('}', ']', ',', ' ', '\n', '\r', '\t'):
            clean_text = clean_text[:-1]
            
        # Drop the final quote that enclosed the text value
        if clean_text.endswith('"'):
            clean_text = clean_text[:-1]
            
        # Clean up any leftover escaped quotes or newlines
        clean_text = clean_text.replace('\\"', '"').replace('\\n', ' ').strip()
        
        if speaker and clean_text:
            dialogue.append({"speaker": speaker, "text": clean_text})
            
    if not dialogue:
        raise Exception("Regex fallback failed to find any dialogue.")
        
    return dialogue

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
    
    return firestore.client(), storage.bucket()

def generate_podcast_script(news, lit, grants, duration_minutes=5):
    api_key = os.environ.get('GEMINI_API_KEY')
    
    # DEBUG: Print available models to help resolve the 404
    try:
        models_url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
        models_res = requests.get(models_url)
        if models_res.ok:
            available = [m.get('name') for m in models_res.json().get('models', [])]
            print(f"--- AVAILABLE GEMINI MODELS: {', '.join(available)} ---")
        else:
            print(f"--- FAILED TO LIST MODELS: {models_res.text} ---")
    except Exception as e:
        print(f"--- FAILED TO LIST MODELS Exception: {e} ---")
        

    safe_news = news[:4] if news else []
    safe_lit = lit[:3] if lit else []
    safe_grants = grants[:2] if grants else []
    
    # Scale word count to match target duration (~150 words per minute of speech)
    target_words = duration_minutes * 150
    
    prompt = f"""
    You are writing a ~{duration_minutes}-minute dynamic podcast script based on today's biological advancements.
    The podcast features two hosts: 'Al' (male) and 'Matt' (male).
    They are energetic, natural, banter a lot, and deeply analyze the science.
    
    STRICT TTS FORMATTING (MANDATORY):
    - You MUST include emotion tags at the start of almost every line or when the tone shifts.
    - Supported tags: [excited], [thoughtful], [laughing], [serious], [surprised], [whispering], [happy], [sad], [loud], [low voice], [sigh].
    - Use conversational fillers like 'hmm', 'right', 'exactly', and 'you know'.
    - Use ellipses (...) for natural pauses.
    
    Make the script thorough (around {target_words} words total across all lines).
    Use the following news, literature, and grants for material:
    NEWS: {json.dumps(safe_news)}
    LIT: {json.dumps(safe_lit)}
    GRANTS: {json.dumps(safe_grants)}
    
    Return EXACTLY a pure JSON array containing the dialogue, with NO markdown formatting, like this:
    [
      {{"speaker": "Al", "text": "[excited] Welcome back to the Deep Dive! [happy] Today we have some incredible news."}},
      {{"speaker": "Matt", "text": "[thoughtful] That's right, Al. [laughing] I couldn't believe it when I read the report on..."}}
    ]
    
    CRITICAL: Ensure every double quote inside a speaker's text is escaped with a backslash (e.g., Matt says, \\"Wow!\\").
    """
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key={api_key}"
    
    max_retries = 3
    for attempt in range(max_retries):
        res = requests.post(url, json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json"}
        })
        
        if res.ok:
            break
            
        if res.status_code == 429:
            wait_time = (attempt + 1) * 35 # Wait 35s, then 70s, as free tier restricts RPM strictly
            print(f"Gemini Rate Limited (429). Attempt {attempt + 1}/{max_retries}. Waiting {wait_time}s...")
            time.sleep(wait_time)
        else:
            raise Exception(f"Gemini REST API Error: {res.status_code} {res.text}")
    else:
        raise Exception(f"Gemini REST API Error: Failed after {max_retries} retries due to 429 Quota Exhaustion. Response: {res.text}")
    
    data = res.json()
    raw_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "[]")
    
    try:
        # First attempt native json load (most robust if valid)
        # Strip potential markdown blocks
        clean = re.sub(r'```(?:json)?\s*', '', raw_text)
        clean = re.sub(r'\s*```', '', clean).strip()
        return json.loads(clean)
    except json.JSONDecodeError as e:
        print(f"Initial JSON parse failed: {e}")
        try:
            print("Attempting bulletproof regex extraction...")
            return parse_dialogue_fallback(raw_text)
        except Exception as e2:
            print(f"Failed regex fallback: {e2}")
            raise e

def generate_fish_audio_segments(script):
    """Use Fish Audio S2 Pro natively deployed on private Modal GPUs ($30 free tier)."""
    modal_url = os.getenv("MODAL_APP_URL")
    if not modal_url:
        raise Exception("MODAL_APP_URL secret is completely missing from your environment. You must deploy 'modal_fish_tts.py' to obtain your personalized zero-queue inference URL and inject it into your GitHub Repository secrets.")
        
    print(f"Dialing direct secure pipeline to Modal infrastructure ({modal_url})...")
    client = None
    import requests
    for attempt in range(15):
        try:
            # Wake up the endpoint and allow model weights to download on the Modal GPU
            res = requests.get(modal_url, timeout=30)
            if res.status_code == 200:
                print("Modal Gradio UI is fully awake! Establishing Client binding...")
                client = Client(modal_url)
                break
            else:
                raise Exception(f"Non-200 OK Status: {res.status_code}")
        except Exception as e:
            if attempt == 14:
                raise Exception(f"Modal server timed out cold-booting. Check modal dashboard: {e}")
            print(f"Waiting for Modal Cold-Boot allocation and weight injection on A10G (Attempt {attempt+1}/15)...")
            time.sleep(20) # Keep holding until VM spins up (Total ~5 mins)
    files = []
    
    # Get the directory where this script is located
    base_dir = os.path.dirname(os.path.abspath(__file__))
    voices_dir = os.path.join(base_dir, "voices")
    
    # Paths to reference audio and transcriptions
    voice_refs = {
        "Al": {
            "audio": os.path.join(voices_dir, "Al.mp3"),
            "text": os.path.join(voices_dir, "al.txt")
        },
        "Matt": {
            "audio": os.path.join(voices_dir, "Matt.mp3"),
            "text": os.path.join(voices_dir, "matt.txt")
        }
    }
    
    # Pre-load reference texts
    ref_texts = {}
    for speaker, paths in voice_refs.items():
        if os.path.exists(paths["text"]):
            with open(paths["text"], "r", encoding="utf-8") as f:
                ref_texts[speaker] = f.read().strip()
        else:
            print(f"Warning: Reference text for {speaker} not found at {paths['text']}")
            ref_texts[speaker] = ""

    for i, line in enumerate(script):
        speaker = line.get('speaker', 'Alex')
        text = line.get('text', '')
        if not text.strip():
            continue
        
        ref = voice_refs.get(speaker, voice_refs["Al"])
        ref_text = ref_texts.get(speaker, "")
        
        print(f"  Synthesizing segment {i} with Fish Audio ({speaker})...")
        
        # Implement retry logic with exponential backoff for rate limits
        max_retries = 3
        success = False
        for attempt in range(max_retries):
            try:
                # S2 Pro endpoint expects 8 parameters
                result = client.predict(
                    text=text,
                    ref_audio=handle_file(ref["audio"]) if os.path.exists(ref["audio"]) else None,
                    ref_text=ref_text if ref_text else " ", # Required by S2 Pro
                    max_new_tokens=1024,
                    chunk_length=200,
                    top_p=0.7,
                    repetition_penalty=1.1, # Lowered for more natural flow
                    temperature=0.35,       # Lowered for higher stability
                    api_name="/tts_inference"
                )
                
                # S2 Pro returns a string path or a FileData dict
                if isinstance(result, dict):
                    temp_file = result.get('value', result.get('path'))
                else:
                    temp_file = result
                
                if not temp_file:
                    raise Exception("Model returned empty result")
                
                final_segment_path = f"/tmp/segment_{i}.mp3"
                shutil.copy(temp_file, final_segment_path)
                files.append(final_segment_path)
                print(f"    Done: {len(text)} chars -> {final_segment_path}")
                success = True
                break
                
            except Exception as e:
                err_str = str(e)
                if "429" in err_str or "Too Many Requests" in err_str:
                    wait_time = (2 ** attempt) * 5
                    print(f"    Rate limited (429). Attempt {attempt + 1}/{max_retries}. Waiting {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    print(f"    Error synthesizing segment {i} on attempt {attempt + 1}: {e}")
                    if attempt == max_retries - 1:
                        break
                    time.sleep(2)
        
        if not success:
            print(f"    Failed to synthesize segment {i} after {max_retries} attempts.")
            continue
    
    return files

def generate_kokoro_audio_segments(script):
    """Use Kokoro ONNX for local, rapid, free, unlimited TTS generation."""
    files = []
    base_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(base_dir, "kokoro-v1.0.onnx")
    voices_path = os.path.join(base_dir, "voices-v1.0.bin")
    
    if not os.path.exists(model_path) or not os.path.exists(voices_path):
        raise Exception(f"Kokoro model files not found locally in backend_worker. Ensure build step downloads them.")
    
    print("Loading Kokoro ONNX model locally into memory...")
    kokoro = Kokoro(model_path, voices_path)
    print("Kokoro loaded successfully.")
    
    for i, line in enumerate(script):
        speaker = line.get('speaker', 'Alex')
        text = line.get('text', '')
        if not text.strip():
            continue
            
        # Map Al and Matt to high-quality Kokoro broadcast presets
        voice = "am_michael" if speaker == "Al" else "am_adam"
        
        print(f"  Synthesizing segment {i} with Kokoro ({speaker} -> {voice})...")
        try:
            # Create returns (audio_array, sample_rate)
            audio, sr = kokoro.create(text, voice=voice, speed=1.0, lang="en-us")
            
            final_segment_path = f"/tmp/kokoro_segment_{i}.wav"
            sf.write(final_segment_path, audio, sr)
            files.append(final_segment_path)
            
            print(f"    Done: {len(text)} chars -> {final_segment_path}")
        except Exception as e:
            print(f"    Failed to synthesize segment {i} with Kokoro: {e}")
            continue

    return files

def merge_audio(files, output_path):
    final_audio = AudioSegment.empty()
    # Add a tiny bit of silence between segments for a natural conversational pace
    silence = AudioSegment.silent(duration=300) 
    
    for f in files:
        seg = AudioSegment.from_file(f) # S2 Pro returns wav/mp3, from_file is safer
        if len(final_audio) > 0:
            final_audio += silence + seg
        else:
            final_audio += seg
            
    final_audio.export(output_path, format="mp3", bitrate="192k")

def main():
    try:
        db, bucket = setup_firebase()
    except Exception as e:
        print("Failed to setup firebase:", e)
        raise e

    users = list(db.collection('users').stream())
    print(f"Loaded {len(users)} users from Firestore.")
    
    for user in users:
        print(f"Checking user {user.id} for podcast generation...")
        feed_ref = db.collection('users').document(user.id).collection('daily').document('feed')
        feed_snap = feed_ref.get()
        
        if not feed_snap.exists:
            print(f"Skipping {user.id} - No daily feed established yet.")
            continue
            
        feed_data = feed_snap.to_dict()
        today = datetime.utcnow().strftime('%Y-%m-%d')
        feed_date = feed_data.get('date', '')
        
        # Check if a WORKING podcast already exists for TODAY
        # (signed URLs contain 'X-Goog-Signature')
        existing_url = feed_data.get('podcastUrl', '')
        if existing_url and 'X-Goog-Signature' in existing_url and feed_date == today:
            print(f"Skipping {user.id} - Today's podcast ({today}) already generated.")
            continue
            
        news = feed_data.get('news', [])
        lit = feed_data.get('literature', [])
        grants = feed_data.get('grants', [])
        
        if not news and not lit:
            print(f"Skipping {user.id} - Insufficient data for a podcast (Found {len(news)} news, {len(lit)} lit).")
            continue
            
        # Parse User Profile & Settings
        try:
            settings_snap = db.collection('users').document(user.id).collection('settings').document('config').get()
            if settings_snap.exists:
                user_settings = settings_snap.to_dict()
            else:
                user_settings = {}
        except Exception:
            user_settings = {}
            
        tts_engine = user_settings.get('ttsEngine', 'kokoro')
        
        try:
            # Look up user email via Firebase Auth
            user_record = auth.get_user(user.id)
            user_email = user_record.email or ""
            print(f"  Email: {user_email}")
        except Exception:
            user_email = ""
        
        is_admin = (user_email.lower() == "elijahryal@gmail.com")
        
        # Check explicit credentials for 15 min unlock from previous config
        has_creds = bool(user_settings.get('googleCloudTtsCredentials'))
        duration_minutes = 15 if (is_admin or has_creds) else 5
        
        print(f"  Podcast tier: {duration_minutes}-minute generation")
        print(f"  TTS Engine: {tts_engine.upper()}")
            
        try:
            print("Generating podcast script from Gemini...")
            script = generate_podcast_script(news, lit, grants, duration_minutes=duration_minutes)
            print(f"Generated {len(script)} lines of dialogue.")
            
            if tts_engine == 'fish':
                print("Synthesizing audio with Fish Audio (Hugging Face Gradio)...")
                files = generate_fish_audio_segments(script)
            else:
                print("Synthesizing audio with Kokoro (Local ONNX)...")
                files = generate_kokoro_audio_segments(script)
            
            # Merge
            master_mp3 = f"/tmp/master_{user.id}.mp3"
            print(f"Merging {len(files)} audio segments...")
            merge_audio(files, master_mp3)
            
            # Upload
            print("Uploading to Firebase Storage...")
            blob_path = f"podcasts/{user.id}/{datetime.utcnow().strftime('%Y-%m-%d')}_deepdive.mp3"
            blob = bucket.blob(blob_path)
            blob.upload_from_filename(master_mp3, content_type='audio/mpeg')
            
            # Generate a signed URL (7-day expiry) so the audio is playable without storage rules
            audio_url = blob.generate_signed_url(
                version="v4",
                expiration=timedelta(days=7),
                method="GET",
            )
            
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
