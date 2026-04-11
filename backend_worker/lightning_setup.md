# Setting Up Fish Audio API on Lightning AI Studio

Follow these steps to deploy the Fish-Speech API server on your Lightning AI hardware. This will allow your GitHub Actions worker to generate high-quality audio using your GPU.

## 1. Create a GPU Studio
1. Log in to [Lightning AI](https://lightning.ai/).
2. Create a new **Studio**.
3. Select a GPU accelerator (e.g., **A10G** or **L4**).
4. Start the Studio.

## 2. Install Dependencies
Open the terminal in your Studio and run the following:

```bash
# Update and install system dependencies
sudo apt-get update
sudo apt-get install -y portaudio19-dev libsox-dev ffmpeg

# Clone the repository
git clone https://github.com/fishaudio/fish-speech.git
cd fish-speech

# Install Python dependencies (choose the one that matches your CUDA version, usually cu121 for newer GPUs)
pip install -e .[cu121]
```

## 3. Download Models
You will need the Llama and VQGAN checkpoints. You can download them from HuggingFace within the Studio terminal:

```bash
# Example: Download the 1.4B model
huggingface-cli download fishaudio/fish-speech-1.4 --local-dir checkpoints/fish-speech-1.4
```

## 4. Run the API Server
Start the server and bind it to all interfaces so it can be exposed:

```bash
python tools/api_server.py \
    --listen 0.0.0.0:8080 \
    --llama-checkpoint-path checkpoints/fish-speech-1.4 \
    --decoder-checkpoint-path checkpoints/fish-speech-1.4/decoder.pth \
    --api-key YOUR_CHOSEN_SECRET_KEY
```

## 5. Expose the Port
1. In the Lightning AI Studio UI, find the **"Ports"** or **"App"** tab.
2. Expose port **8080**.
3. Lightning will provide a public URL (e.g., `https://8080-unique-id.lightning.ai`).

## 6. Update GitHub Secrets
Copy the public URL and your API Key to your GitHub repository secrets:
- `FISH_AUDIO_API_URL`: The URL from step 5.
- `FISH_AUDIO_API_KEY`: The key you chose in step 4.
