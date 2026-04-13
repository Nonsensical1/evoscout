import modal
import os
import subprocess

app = modal.App("evoscout-fish-speech")

# Recreate the HuggingFace Spaces Environment in Modal
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "ffmpeg", "libsm6", "libxext6")
    .run_commands(
        # We clone the exact S2-Pro Hugging Face UI space that was rate binding us
        "git clone https://huggingface.co/spaces/fishaudio/fish-speech-1 /app"
    )
    .run_commands(
        # We inject CUDA PyTorch before installing requirements
        "pip uninstall -y torch torchaudio torchvision",
        "pip install torch torchaudio torchvision --index-url https://download.pytorch.org/whl/cu121"
    )
    .run_commands(
        "cd /app && pip install -r requirements.txt",
        "pip install pydantic==2.8.2 fastapi==0.112.0" # Stabilize gradio deps
    )
)

@app.function(
    image=image, 
    gpu="A10G", # Allocate a dedicated A10G chunk from Modal's free tier
    scaledown_window=120 # Shuts down compute if idle for 2 mins (Saves massive tier limits)
)
@modal.web_server(port=7860)
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
