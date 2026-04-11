import os
import shutil
from gradio_client import Client, handle_file

def test_synthesis():
    print("Connecting to Fish Audio Gradio Space...")
    try:
        # Check for HF_TOKEN to bypass limits (using 'token' for v2.x compatibility)
        hf_token = os.getenv("HF_TOKEN")
        client = Client("fguilleme/fish-s2-pro-zero", token=hf_token, verbose=True)
    except Exception as e:
        print(f"Failed to connect: {e}")
        return

    # Get the directory where this script is located
    base_dir = os.path.dirname(os.path.abspath(__file__))
    voices_dir = os.path.join(base_dir, "voices")
    
    # Dummy reference (you need to have these files in backend_worker/voices/)
    ref_audio = os.path.join(voices_dir, "al.mp3")
    ref_text_path = os.path.join(voices_dir, "al.txt")
    
    if not os.path.exists(ref_audio):
        print(f"Skipping test: Reference audio not found at {ref_audio}")
        return

    ref_text = ""
    if os.path.exists(ref_text_path):
        with open(ref_text_path, "r") as f:
            ref_text = f.read().strip()

    print("Synthesizing test segment...")
    try:
        # S2 Pro endpoint expects 8 parameters
        result = client.predict(
            text="[excited] This is a test of the upgraded Fish Audio S2 Pro synthesis! It should sound much better.",
            ref_audio=handle_file(ref_audio),
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
            
        print(f"Success! Result saved at: {temp_file}")
        shutil.copy(temp_file, "test_output.mp3")
        print("Copied to test_output.mp3")
        
    except Exception as e:
        print(f"Synthesis failed: {e}")

if __name__ == "__main__":
    test_synthesis()
