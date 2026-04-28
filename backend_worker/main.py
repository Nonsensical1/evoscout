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

def generate_podcast_script(news, lit, grants, duration_minutes=5, use_emotion_tags=False):
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
    
    # Divide generation into 5-minute segments to avoid AI output token limits and 503 timeouts
    import math
    segment_duration = 5
    num_parts = math.ceil(duration_minutes / segment_duration) if duration_minutes > 5 else 1
    target_words_part = (duration_minutes * 150) // num_parts
    
    full_script = []
    previous_context = ""
    
    for part in range(1, num_parts + 1):
        print(f"Generating podcast script part {part}/{num_parts}...")
        
        if use_emotion_tags:
            tts_format_block = """
        STRICT TTS FORMATTING (MANDATORY):
        - You MUST include emotion tags at the start of almost every line or when the tone shifts.
        - Supported tags: [excited], [thoughtful], [laughing], [serious], [surprised], [whispering], [happy], [sad], [loud], [low voice], [sigh].
        - Use conversational fillers like 'hmm', 'right', 'exactly', and 'you know'.
        - Use ellipses (...) for natural pauses.
        """
        else:
            tts_format_block = """
        FORMATTING (MANDATORY):
        - Do NOT include any bracketed emotion tags (e.g. [excited], [laughing]) — write clean, natural prose only.
        - Use conversational fillers like 'hmm', 'right', 'exactly', and 'you know'.
        - Use ellipses (...) for natural pauses.
        - Vary sentence rhythm naturally to convey emotion through word choice alone.
        """

        prompt = f"""
        You are writing Part {part} of {num_parts} for a ~{duration_minutes}-minute dynamic podcast script based on today's biological advancements.
        The podcast features two hosts: 'Al' (male) and 'Matt' (male).
        They are energetic, natural, banter a lot, and deeply analyze the science.
        {tts_format_block}
        Make this specific part thorough (around {target_words_part} words total across all lines).
        """
        
        if part == 1 and num_parts > 1:
            prompt += "As Part 1, start with a welcoming introduction to the podcast, then dive into the first topics.\n"
        elif part == num_parts and num_parts > 1:
            prompt += "As the final part, cover the remaining topics and provide a concluding wrap-up for the podcast.\n"
        elif num_parts > 1:
            prompt += "As a middle part, smoothly continue the conversation without a formal introduction.\n"

        if previous_context:
            prompt += f"\nFor context, here are the last few lines of the previous segment so you can continue the flow naturally:\n{previous_context}\n"

        prompt += f"""
        Use the following news, literature, and grants for material. Progress through different items across the parts:
        NEWS: {json.dumps(safe_news)}
        LIT: {json.dumps(safe_lit)}
        GRANTS: {json.dumps(safe_grants)}
        
        Return EXACTLY a pure JSON array containing the dialogue for THIS PART ONLY, with NO markdown formatting, like this:
        [
          {{"speaker": "Al", "text": "[excited] Welcome back! [happy] Today we have some incredible news."}},
          {{"speaker": "Matt", "text": "[thoughtful] That's right, Al. [laughing] I couldn't believe it..."}}
        ]
        
        CRITICAL: Ensure every double quote inside a speaker's text is escaped with a backslash.
        """
        
        # Model fallback chain — ordered by free-tier daily quota headroom.
        GEMINI_MODELS = [
            "gemini-2.0-flash",       # 1,500 RPD free — primary
            "gemini-2.5-flash",       # 500 RPD free  — first fallback
            "gemini-2.5-flash-lite",  # 20 RPD free   — last resort
        ]
        RETRYABLE_CODES = {429, 503, 529}  # quota, overloaded, overloaded

        res = None
        last_error = None

        for model in GEMINI_MODELS:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            print(f"  [Gemini Part {part}] Trying model: {model}")

            for attempt in range(3):
                res = requests.post(url, json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"responseMimeType": "application/json"}
                })

                if res.ok:
                    print(f"  [Gemini Part {part}] Success with {model}")
                    break

                if res.status_code in RETRYABLE_CODES:
                    wait_time = (attempt + 1) * 20  # 20s, 40s, 60s
                    print(f"  [Gemini Part {part}] {model} error {res.status_code}. Attempt {attempt + 1}/3. Waiting {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    # Hard error (400, 401, 404…) — not retryable on any model
                    raise Exception(f"Gemini API Error ({model}): {res.status_code} {res.text}")
            else:
                # All 3 retries exhausted → try next model
                last_error = res.text
                print(f"  [Gemini Part {part}] {model} exhausted (code {res.status_code}), trying next model...")
                continue

            break  # Success — stop trying models
        else:
            raise Exception(f"Gemini Error for Part {part}: All models failed. Last response: {last_error}")

        data = res.json()
        raw_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "[]")
        
        try:
            clean = re.sub(r'```(?:json)?\s*', '', raw_text)
            clean = re.sub(r'\s*```', '', clean).strip()
            part_script = json.loads(clean)
        except json.JSONDecodeError as e:
            print(f"Initial JSON parse failed for part {part}: {e}")
            try:
                print("Attempting bulletproof regex extraction...")
                part_script = parse_dialogue_fallback(raw_text)
            except Exception as e2:
                print(f"Failed regex fallback for part {part}: {e2}")
                raise e
        
        full_script.extend(part_script)
        
        if len(part_script) >= 3:
            previous_context = json.dumps(part_script[-3:], indent=2)
        elif part_script:
            previous_context = json.dumps(part_script, indent=2)

    return full_script


def generate_fish_audio_segments(script, user_modal_url=None):
    """Use Fish Audio S2 Pro via native Modal FastAPI endpoint."""
    import requests
    import base64

    modal_url = user_modal_url or os.getenv("MODAL_APP_URL")
    if not modal_url:
        raise Exception("No Modal URL configured. User must link their custom endpoint in Settings or MODAL_APP_URL must be set globally.")

    # asgi_app exposes explicit FastAPI routes — our handler is at POST /synthesize
    synthesize_url = modal_url.rstrip("/") + "/synthesize"
    print(f"Dialing native Modal S2-Pro endpoint: {synthesize_url}...")

    base_dir = os.path.dirname(os.path.abspath(__file__))
    voices_dir = os.path.join(base_dir, "voices")

    voice_refs = {
        "Al":   {"audio": os.path.join(voices_dir, "Al.mp3"),   "text": os.path.join(voices_dir, "al.txt")},
        "Matt": {"audio": os.path.join(voices_dir, "Matt.mp3"), "text": os.path.join(voices_dir, "matt.txt")},
    }

    ref_texts = {}
    ref_audio_b64 = {}
    for speaker, paths in voice_refs.items():
        if os.path.exists(paths["text"]):
            with open(paths["text"], "r", encoding="utf-8") as f:
                ref_texts[speaker] = f.read().strip()
        else:
            ref_texts[speaker] = ""
        if os.path.exists(paths["audio"]):
            with open(paths["audio"], "rb") as f:
                ref_audio_b64[speaker] = base64.b64encode(f.read()).decode()
        else:
            ref_audio_b64[speaker] = ""

    files = []
    for i, line in enumerate(script):
        speaker = line.get("speaker", "Al")
        text = line.get("text", "")
        if not text.strip():
            continue

        print(f"  Synthesizing segment {i} ({speaker}): {text[:60]}...")

        payload = {
            "text": text,
            "ref_audio_b64": ref_audio_b64.get(speaker, ""),
            "ref_text": ref_texts.get(speaker, ""),
            # Push the autoregressive transformer into highly-expressive territory
            "temperature": 0.85, 
            "top_p": 0.95,
            "repetition_penalty": 1.2
        }

        max_retries = 3
        success = False
        for attempt in range(max_retries):
            try:
                # Long timeout — cold boot can take ~60s even with baked weights
                res = requests.post(synthesize_url, json=payload, timeout=300)
                if res.status_code == 200:
                    out_path = f"/tmp/segment_{i}.wav"
                    with open(out_path, "wb") as f:
                        f.write(res.content)
                    files.append(out_path)
                    print(f"    Done: {len(text)} chars -> {out_path}")
                    success = True
                    break
                else:
                    err_msg = str(res.text[:200]).lower()
                    if "credit" in err_msg or "balance" in err_msg or "quota" in err_msg or res.status_code in [402, 429]:
                        raise Exception(f"MODAL_QUOTA_EXCEEDED: HTTP {res.status_code}: {res.text[:200]}")
                    raise Exception(f"Modal returned HTTP {res.status_code}: {res.text[:200]}")
            except Exception as e:
                print(f"    Attempt {attempt+1}/{max_retries} failed: {e}")
                if "MODAL_QUOTA_EXCEEDED" in str(e):
                    raise e
                if attempt < max_retries - 1:
                    time.sleep(10)

        if not success:
            print(f"    Skipping segment {i} after {max_retries} failed attempts.")
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
            
        podcast_enabled = user_settings.get('podcastEnabled', False)
        if not podcast_enabled:
            print(f"Skipping {user.id} - Podcast disabled in settings.")
            continue
            
        tts_engine = user_settings.get('ttsEngine', 'kokoro').lower()  # normalize FISH/Fish/fish -> fish
        
        try:
            # Look up user email via Firebase Auth
            user_record = auth.get_user(user.id)
            user_email = user_record.email or ""
            print(f"  Email: {user_email}")
        except Exception:
            user_email = ""
        
        is_admin = (user_email.lower() == "elijahryal@gmail.com")
        
        # Enforce 1-time free Fish S2-Pro rule for non-admins using the default global Modal
        user_modal_url = user_settings.get('customModalUrl', '').strip()
        if tts_engine == 'fish' and not user_modal_url and not is_admin:
            fish_free_uses = user_settings.get('fishFreeUses', 0)
            if fish_free_uses >= 1:
                print("  [LIMIT] User has exhausted their 1 free Fish S2-Pro use. Downgrading to Kokoro TTS.")
                tts_engine = 'kokoro'
            else:
                print("  [LIMIT] Consuming 1 free Fish S2-Pro use. Updating Firestore.")
                try:
                    db.collection('users').document(user.id).collection('settings').document('config').set(
                        {'fishFreeUses': firestore.Increment(1)}, merge=True
                    )
                except Exception as e:
                    print(f"  Warning: failed to increment fishFreeUses: {e}")
        
        # Check explicit credentials for premium unlock from previous config (now 8 min max to save Fish compute)
        has_creds = bool(user_settings.get('googleCloudTtsCredentials'))
        duration_minutes = 8 if (is_admin or has_creds) else 5
        
        print(f"  Podcast tier: {duration_minutes}-minute generation")
        print(f"  TTS Engine: {tts_engine.upper()}")
            
        try:
            print("Generating podcast script from Gemini...")
            script = generate_podcast_script(news, lit, grants, duration_minutes=duration_minutes, use_emotion_tags=(tts_engine == 'fish'))
            print(f"Generated {len(script)} lines of dialogue.")
            
            if tts_engine == 'fish':
                print("Synthesizing audio with Fish Audio (Modal)...")
                try:
                    files = generate_fish_audio_segments(script, user_modal_url=user_modal_url if user_modal_url else None)
                except Exception as e:
                    if "MODAL_QUOTA_EXCEEDED" in str(e):
                        print("  [MODAL QUOTA] Credits exhausted! Downgrading to Kokoro and locking user config.")
                        try:
                            db.collection('users').document(user.id).collection('settings').document('config').set(
                                {'modalQuotaExceededMonth': datetime.utcnow().month, 'ttsEngine': 'kokoro'}, merge=True
                            )
                        except Exception as e2:
                            print(f"  Warning: failed to flag modalQuotaExceededMonth: {e2}")
                        files = generate_kokoro_audio_segments(script)
                    else:
                        raise e
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
