# Local 4-bit handwriting recognition

Math Buddy uses **GLM-OCR locally on the NVIDIA GPU** to transcribe handwriting
and uploaded questions. **Gemini 3.5 Flash-Lite** checks confirmed math and
provides requested hints. The existing 1.5-second pause starts local recognition;
the check button still controls mathematical review.

## Install and run

```powershell
.\setup-local-ocr.ps1
.\.checker-venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Stop an older Math Buddy server before starting this updated version, then
refresh http://127.0.0.1:8000/. For iPad use `--host 0.0.0.0` and open the laptop's
LAN address. The iPad sends ink to the laptop, which performs local GPU OCR.

The one-time installer downloads checksum-verified, prequantized files:

- GLM-OCR decoder: **Q4_K_M**, approximately 549 MB.
- GLM-OCR vision encoder/projector: **Q4_1**, approximately 298 MB.
- A pinned official llama.cpp Windows Vulkan runtime, approximately 32 MB.

Both neural components use standard 4-bit GGUF quantizations. These formats
retain some small tensors in higher precision as part of the quantization
format; no BF16/F16/Q8 model is selected or loaded. There is no full-precision
download or on-device quantization step. Existing Python model environments
and the old UniMERNet files are unchanged. Ollama is not used by this setup.

The local worker starts lazily on the first reading and exits after 60 idle
seconds to release GPU memory. It uses Vulkan on the NVIDIA GPU, not the old
CPU-only PyTorch installation. The backend rejects weights with other GGUF
precision metadata before launch, requires 2.3 GB of free GPU memory, fixes a
2048-token context and one inference slot, bounds images to 1024 × 512 pixels,
and verifies that every decoder layer was offloaded to the NVIDIA GPU. A second
worker on the same local port is rejected. There is no CPU or cloud OCR fallback.
Keep other local models unloaded on this 6 GB GPU.

The vision workspace is capped at 512 image tokens and large warm-up allocation
is disabled. On Windows, the worker has a 3 GB process RAM limit and is killed
automatically if its owning app exits. Its loopback endpoint uses an ephemeral
local access key, separate from the Gemini key.

The API key stays in `.env` on the laptop:

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

OCR works without the Gemini key or internet after installation. Checking and
hints require the key and internet. Math remains editable before review, and
OCR output is not a correctness verdict. Crop long/multiple questions to one
problem and check task words/conditions in the editable question reading.

## Troubleshooting

`/api/recognition-status` reports installation, loaded state, precision, GPU
device, and configured review model without exposing the API key.
`artifacts/glm-ocr.log` contains local worker diagnostics. If memory is low, close
other local models and retry; the app refuses to load a larger model. If a
server was forcefully terminated and left its worker behind, stop only the
`llama-server.exe` whose command line points into this project's
`models/glm-ocr-q4` directory before restarting Math Buddy. Normal server shutdown
and the idle timer stop its worker automatically; the Windows job guard also
cleans it up if the owning app is forcefully terminated.

Gemini 2.5 Flash-Lite was initially requested, but Google's API rejected it as
unavailable to new users of this key. The user selected 3.5 Flash-Lite instead.
Live algebra and calculus review calls succeeded with that replacement.
Local OCR tests used approximately 1.7–1.9 GB total GPU memory, including the
desktop. Printed math was read successfully; a block-drawn digit was misread
and corrected in the editable reading before checking. Review OCR output rather
than assuming every handwritten symbol is accurate.
The 60-second idle shutdown was verified on the running app: the worker exited,
status changed to loaded=false, and total GPU memory returned to about 0.9 GB.

Sources: [GLM-OCR](https://huggingface.co/zai-org/GLM-OCR),
[pinned Q4 GGUF files](https://huggingface.co/octopusmegalopod/some-glmocr-ggufs/tree/318c473f8b924c4ccbd748d85ecc22a76d499c50),
[official runtime release](https://github.com/ggml-org/llama.cpp/releases/tag/b11718),
[Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite).
