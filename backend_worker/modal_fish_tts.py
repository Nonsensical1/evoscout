"""
EvoScout Fish Audio S2-Pro — Modal Private Inference Endpoint
============================================================
Native FastAPI endpoint (no Gradio, no HfFolder dependency conflicts).
Accepts POST /synthesize with JSON {text, ref_audio_b64, ref_text}
Returns raw WAV audio bytes.
"""
import modal

app = modal.App("evoscout-fish-speech")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "ffmpeg", "libsm6", "libxext6", "portaudio19-dev")
    .run_commands(
        # Clone the fish-speech source code (not the Gradio space — just the engine)
        "git clone https://github.com/fishaudio/fish-speech.git /fish-speech",
        "cd /fish-speech && pip install -e .",
    )
    .run_commands(
        # Install CUDA-enabled PyTorch (must come after fish-speech deps)
        "pip uninstall -y torch torchaudio torchvision",
        "pip install torch==2.3.1 torchaudio==2.3.1 --index-url https://download.pytorch.org/whl/cu121",
    )
    .run_commands(
        # FastAPI/uvicorn for our native endpoint (no Gradio needed)
        "pip install fastapi uvicorn python-multipart",
    )
    .run_commands(
        # Pre-bake model weights into the image (eliminates cold-boot download)
        "pip install huggingface_hub",
        "python -c \"from huggingface_hub import snapshot_download; snapshot_download(repo_id='fishaudio/s2-pro', local_dir='/checkpoints/s2-pro')\"",
    )
)


@app.function(
    image=image,
    gpu="A10G",
    scaledown_window=300,  # Stay warm for 5 min after last request
    timeout=600,
)
@modal.fastapi_endpoint(method="POST", label="fish-tts-synthesize")
def synthesize(item: dict):
    """
    Native S2-Pro inference endpoint.
    Expects JSON: { "text": str, "ref_audio_b64": str (base64 WAV/MP3), "ref_text": str }
    Returns: raw WAV bytes (audio/wav content-type)
    """
    import sys
    import base64
    import tempfile
    import io
    import os
    import torch
    import torchaudio
    from fastapi.responses import Response

    sys.path.insert(0, "/fish-speech")

    from fish_speech.models.text2semantic.inference import launch_thread_safe_queue
    from fish_speech.models.dac.inference import load_model as load_decoder_model
    from fish_speech.inference_engine import TTSInferenceEngine
    from fish_speech.utils.schema import ServeTTSRequest

    checkpoint_dir = "/checkpoints/s2-pro"
    device = "cuda" if torch.cuda.is_available() else "cpu"
    precision = torch.bfloat16

    # Load models (cached in container memory across warm requests)
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

    text = item.get("text", "")
    ref_audio_b64 = item.get("ref_audio_b64", "")
    ref_text = item.get("ref_text", "")

    # Decode reference audio from base64
    refs = []
    if ref_audio_b64:
        raw = base64.b64decode(ref_audio_b64)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(raw)
            ref_path = f.name

        # Re-encode to the format fish_speech expects
        waveform, sr = torchaudio.load(ref_path)
        buf = io.BytesIO()
        torchaudio.save(buf, waveform, sr, format="wav")
        buf.seek(0)
        refs = [{"audio": buf.read(), "text": ref_text}]

    # Run inference
    request = ServeTTSRequest(
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

    audio_chunks = list(engine.inference(request))

    # Concatenate all chunks
    combined = b"".join(audio_chunks)
    return Response(content=combined, media_type="audio/wav")
