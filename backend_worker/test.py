import asyncio
import json
import edge_tts
from pydub import AudioSegment

async def main():
    script = [
        {"speaker": "Alex", "text": "This is a local test of edge tts running perfectly."},
        {"speaker": "Sarah", "text": "I agree, it seems to be working as expected."}
    ]
    
    files = []
    voice_map = {"Alex": "en-US-GuyNeural", "Sarah": "en-US-AriaNeural"}
    
    for i, line in enumerate(script):
        voice = voice_map.get(line['speaker'], "en-US-GuyNeural")
        filepath = f"segment_{i}.mp3"
        print(f"Generating {filepath} with {voice}...")
        communicate = edge_tts.Communicate(line['text'], voice)
        await communicate.save(filepath)
        files.append(filepath)
        
    print("Files generated:", files)
    
    print("Merging with pydub...")
    final_audio = AudioSegment.empty()
    for f in files:
        seg = AudioSegment.from_mp3(f)
        if len(final_audio) > 0:
            final_audio = final_audio.append(seg, crossfade=min(len(final_audio), len(seg), 100))
        else:
            final_audio += seg
            
    final_audio.export("final_test_output.mp3", format="mp3")
    print("Test Complete. final_test_output.mp3 created.")

if __name__ == "__main__":
    asyncio.run(main())
