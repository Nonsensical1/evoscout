import modal
import os
import subprocess

app = modal.App("evoscout-fish-speech")

# Recreate the HuggingFace Spaces Environment in Modal
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "ffmpeg", "libsm6", "libxext6", "portaudio19-dev", "python3-pyaudio")
    .run_commands(
        # We clone the exact S2-Pro Hugging Face UI space that was rate binding us
        "git clone https://huggingface.co/spaces/fguilleme/fish-s2-pro-zero /app"
    )
    .run_commands(
        # We inject CUDA PyTorch before installing requirements
        "pip uninstall -y torch torchaudio torchvision",
        "pip install torch torchaudio torchvision --index-url https://download.pytorch.org/whl/cu121"
    )
    .run_commands(
        "cd /app && pip install -r requirements.txt",
        "pip install pydantic==2.8.2 fastapi==0.112.0 gradio spaces" # Stabilize gradio deps
    )
    .run_commands(
        # Pre-bake the massive model checkpoints directly into the image to eliminate download delays on cold boot
        "pip install huggingface_hub",
        "hf download fishaudio/s2-pro"
    )
)

@app.function(
    image=image, 
    gpu="A10G", # Allocate a dedicated A10G chunk from Modal's free tier
    scaledown_window=300 # Keeps VM awake for 5 mins after generation ends
)
@modal.web_server(port=7860, startup_timeout=600) # Give 10 mins for PyTorch cold compile
def fish_tts_ui():
    """
    Deploys the Fish Audio S2-Pro Gradio UI natively into Modal cloud's infrastructure.
    """
    print("Launching Fish Audio Private Serverless GPU...")
    env = os.environ.copy()
    env["GRADIO_SERVER_NAME"] = "0.0.0.0"
    env["GRADIO_SERVER_PORT"] = "7860"
    # Execute the cloned HF Gradio Space app
    subprocess.Popen(["python", "app.py"], cwd="/app", env=env).wait()
