"""
EvoScout Fish Audio S2-Pro — Modal Private Inference Endpoint
============================================================
Uses @modal.asgi_app() with a real FastAPI instance for reliable routing.
POST /synthesize — takes JSON {text, ref_audio_b64, ref_text}, returns WAV bytes.
GET /health — container warm-up ping.
"""
import modal
import os

app = modal.App("evoscout-fish-speech")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "ffmpeg", "libsm6", "libxext6")
    .run_commands(
        "git clone https://github.com/fishaudio/fish-speech.git /fish-speech",
    )
    .run_commands(
        "pip install torch==2.3.1 torchaudio==2.3.1 --index-url https://download.pytorch.org/whl/cu121",
    )
    .run_commands(
        "pip install transformers==4.44.2",
        "pip install einops natsort loguru hydra-core omegaconf",
        "pip install vector-quantize-pytorch encodec",
        "pip install loralib pyrootutils huggingface_hub",
        "pip install fastapi uvicorn python-multipart",
    )
    .run_commands(
        "python -c \"from huggingface_hub import snapshot_download; snapshot_download(repo_id='fishaudio/s2-pro', local_dir='/checkpoints/s2-pro')\"",
    )
)


@app.function(
    image=image,
    gpu="A10G",
    scaledown_window=300,
    timeout=600,
)
@modal.asgi_app()
def web_app():
    """
    Creates a FastAPI app with model loading at container startup (cached across requests).
    """
    import sys
    sys.path.insert(0, "/fish-speech")

    import torch
    from fish_speech.models.text2semantic.inference import launch_thread_safe_queue
    from fish_speech.models.dac.inference import load_model as load_decoder_model
    from fish_speech.inference_engine import TTSInferenceEngine

    # --- Model loading happens ONCE at container boot, cached for all requests ---
    checkpoint_dir = "/checkpoints/s2-pro"
    device = "cuda" if torch.cuda.is_available() else "cpu"
    precision = torch.bfloat16

    print(f"Loading S2-Pro models from {checkpoint_dir} on {device}...")
    llama_queue = launch_thread_safe_queue(
        checkpoint_path=checkpoint_dir,
        device=device,
        precision=precision,
        compile=False,
    )
    decoder_model = load_decoder_model(
        config_name="modded_dac_vq",
        checkpoint_path=os.path.join(checkpoint_dir, "codec.pth"),
        device=device,
    )
    engine = TTSInferenceEngine(
        llama_queue=llama_queue,
        decoder_model=decoder_model,
        compile=False,
        precision=precision,
    )
    print("S2-Pro models loaded and ready.")

    # --- FastAPI app definition ---
    from fastapi import FastAPI, Request
    from fastapi.responses import Response, JSONResponse

    web = FastAPI()

    @web.get("/health")
    async def health():
        return JSONResponse({"status": "ok", "model": "s2-pro"})

    @web.post("/synthesize")
    async def synthesize(request: Request):
        import base64
        import tempfile
        import io
        import torchaudio
        from fish_speech.utils.schema import ServeTTSRequest

        body = await request.json()
        text = body.get("text", "")
        ref_audio_b64 = body.get("ref_audio_b64", "")
        ref_text = body.get("ref_text", "")

        refs = []
        if ref_audio_b64:
            raw = base64.b64decode(ref_audio_b64)
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                f.write(raw)
                ref_path = f.name
            waveform, sr = torchaudio.load(ref_path)
            buf = io.BytesIO()
            torchaudio.save(buf, waveform, sr, format="wav")
            buf.seek(0)
            refs = [{"audio": buf.read(), "text": ref_text}]

        tts_request = ServeTTSRequest(
            text=text,
            references=refs,
            reference_id=None,
            max_new_tokens=1024,
            chunk_length=200,
            top_p=0.7,
            repetition_penalty=1.1,
            temperature=0.35,
            format="wav",
        )

        audio_chunks = list(engine.inference(tts_request))
        combined = b"".join(audio_chunks)
        return Response(content=combined, media_type="audio/wav")

    return web
