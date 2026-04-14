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
    .apt_install(
        "git", "ffmpeg", "libsm6", "libxext6", "libsndfile1",
        "libavcodec-dev", "libavformat-dev", "libavutil-dev", "libswscale-dev",
    )
    .run_commands(
        "git clone https://github.com/fishaudio/fish-speech.git /fish-speech",
    )
    .run_commands(
        "pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu121",
    )
    .run_commands(
        "pip install soundfile numpy",
        "pip install torchcodec --extra-index-url=https://download.pytorch.org/whl/cu121 || echo '[INFO] torchcodec unavailable — soundfile patch active'",
    )
    .run_commands(
        # No transformers version pin — let pip resolve a compatible version for the cloned fish-speech HEAD
        "pip install transformers",
        "pip install einops natsort loguru hydra-core omegaconf",
        "pip install vector-quantize-pytorch encodec",
        "pip install loralib pyrootutils huggingface_hub",
        "pip install lightning librosa tiktoken safetensors",
        "pip install descript-audio-codec descript-audiotools",
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
    import inspect
    sys.path.insert(0, "/fish-speech")

    # -------------------------------------------------------------------------
    # PATCH 1: Force torchaudio.load to use soundfile backend.
    # torchaudio 2.3+ defaults to torchcodec. Must happen BEFORE fish-speech imports.
    # -------------------------------------------------------------------------
    import torchaudio as _ta
    _orig_ta_load = _ta.load

    def _load_via_soundfile(uri, *args, **kwargs):
        kwargs["backend"] = "soundfile"
        return _orig_ta_load(uri, *args, **kwargs)

    _ta.load = _load_via_soundfile
    print("[EvoScout] PATCH 1: torchaudio.load → soundfile backend")

    # -------------------------------------------------------------------------
    # PATCH 2: Silence ALL visualize() methods in fish-speech modules.
    # Newer fish-speech HEAD calls visualize() for debug output but the
    # tokenizer is None in the queue worker → AttributeError crash.
    # We use inspect to find every class with visualize — no name-guessing.
    # -------------------------------------------------------------------------
    _modules_to_patch = [
        "fish_speech.conversation",
        "fish_speech.content_sequence",
        "fish_speech.models.text2semantic.inference",
    ]
    for _mod_name in _modules_to_patch:
        try:
            import importlib
            _mod = importlib.import_module(_mod_name)
            for _cls_name, _cls in inspect.getmembers(_mod, inspect.isclass):
                if hasattr(_cls, "visualize"):
                    _cls.visualize = lambda self, *args, **kwargs: None
                    print(f"[EvoScout] PATCH 2: {_cls_name}.visualize → no-op")
        except Exception as _e:
            print(f"[EvoScout] PATCH 2 skipped for {_mod_name}: {_e}")

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
        import io
        import base64
        import tempfile
        import subprocess
        import numpy as np
        import soundfile as sf
        from fish_speech.utils.schema import ServeTTSRequest

        body = await request.json()
        text = body.get("text", "")
        ref_audio_b64 = body.get("ref_audio_b64", "")
        ref_text = body.get("ref_text", "")

        refs = []
        if ref_audio_b64:
            raw = base64.b64decode(ref_audio_b64)
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
                f.write(raw)
                src_path = f.name
            # Convert to WAV — soundfile backend requires WAV/FLAC
            wav_path = src_path + ".wav"
            subprocess.run(
                ["ffmpeg", "-y", "-i", src_path, "-ar", "44100", "-ac", "1", wav_path],
                capture_output=True, check=True
            )
            with open(wav_path, "rb") as f:
                refs = [{"audio": f.read(), "text": ref_text}]

        tts_request = ServeTTSRequest(
            text=text,
            references=refs,
            reference_id=None,
            max_new_tokens=1024,
            chunk_length=200,
            top_p=0.7,
            repetition_penalty=1.2, # Fish default for better flow
            temperature=0.7,        # Bumping from 0.35: crucial for high-quality expression
            format="wav",
        )

        # -----------------------------------------------------------------------
        # PATCH 3: Handle InferenceResult objects from newer fish-speech.
        # engine.inference() yields InferenceResult dataclasses, not raw bytes.
        # -----------------------------------------------------------------------
        raw_results = list(engine.inference(tts_request))
        print(f"[EvoScout] engine.inference() yielded {len(raw_results)} result(s)")

        # DEBUG: print full structure of first result so we know exactly what we get
        if raw_results:
            r0 = raw_results[0]
            print(f"[EvoScout] result[0] type={type(r0).__name__}")
            if isinstance(r0, (bytes, bytearray)):
                print(f"[EvoScout]   raw bytes, len={len(r0)}")
            else:
                fields = []
                if hasattr(r0, "__dataclass_fields__"):
                    fields = list(r0.__dataclass_fields__.keys())
                elif hasattr(r0, "_fields"):
                    fields = list(r0._fields)
                for fname in fields:
                    fval = getattr(r0, fname, None)
                    shape = getattr(fval, "shape", None)
                    print(f"[EvoScout]   .{fname} = {type(fval).__name__}"
                          + (f" shape={shape}" if shape is not None else f" val={repr(fval)[:60]}"))

        audio_arrays = []
        sample_rate = 44100

        for result in raw_results:
            # ── raw bytes result (legacy) ──────────────────────────────────────
            if isinstance(result, (bytes, bytearray)):
                try:
                    data, sr = sf.read(io.BytesIO(result))
                    sample_rate = sr
                    data = data.squeeze() if data.ndim > 1 else data
                    audio_arrays.append(data)
                except Exception as e:
                    print(f"[EvoScout] bytes decode failed: {e}")
                continue

            # ── InferenceResult dataclass/namedtuple ───────────────────────────
            # Use 'is not None' — NOT 'or' — to avoid ValueError when the value
            # is a multi-element numpy array (bool(array) raises ValueError).
            audio = None
            for _field in ("audio", "chunk", "data", "waveform", "code"):
                _val = getattr(result, _field, None)
                if _val is not None:
                    audio = _val
                    break

            if audio is None:
                err = getattr(result, "error", None)
                if err:
                    print(f"[EvoScout] Inference chunk error: {err}")
                continue

            # Skip plain scalars — these are likely misidentified sr/finished fields
            if isinstance(audio, (int, float, bool)):
                print(f"[EvoScout] Skipping scalar audio value: {audio}")
                continue

            # Extract sample rate safely (same is-not-None approach)
            for _sr_field in ("sampling_rate", "sr"):
                _sr = getattr(result, _sr_field, None)
                if _sr is not None and isinstance(_sr, (int, float)):
                    sample_rate = int(_sr)
                    break

            # ── bytes inside InferenceResult ───────────────────────────────────
            if isinstance(audio, (bytes, bytearray)):
                try:
                    data, sr = sf.read(io.BytesIO(audio))
                    sample_rate = sr
                    audio = data
                except Exception:
                    audio = np.frombuffer(audio, dtype=np.int16).astype(np.float32) / 32768.0

            # ── (waveform, sample_rate) tuple from DAC decoder ─────────────────
            elif isinstance(audio, (tuple, list)) and len(audio) == 2:
                first, second = audio[0], audio[1]
                # Fish-speech actually returns (sample_rate, waveform)
                if isinstance(first, (int, float)):
                    sample_rate = int(first)
                    audio = second
                elif isinstance(second, (int, float)):
                    sample_rate = int(second)
                    audio = first
                else:
                    audio = first

            # ── torch tensor → numpy ───────────────────────────────────────────
            if hasattr(audio, "cpu"):
                audio = audio.cpu().float().numpy()
            elif not isinstance(audio, np.ndarray):
                try:
                    audio = np.array(audio, dtype=np.float32)
                except Exception as e:
                    print(f"[EvoScout] Could not convert audio to numpy: {e}")
                    continue

            # Flatten (1, N) or (N, 1) → (N,)
            if audio.ndim > 1:
                audio = audio.squeeze()

            if audio.ndim == 0 or audio.size == 0:
                print(f"[EvoScout] Skipping empty/0-d chunk, value={audio}")
                continue

            audio_arrays.append(audio)

        if not audio_arrays:
            raise ValueError("Inference produced no audio — all chunks were empty or errored")


        full_audio = np.concatenate(audio_arrays, axis=0)

        out_buf = io.BytesIO()
        sf.write(out_buf, full_audio, sample_rate, format="WAV")
        combined = out_buf.getvalue()

        return Response(content=combined, media_type="audio/wav")

    return web
