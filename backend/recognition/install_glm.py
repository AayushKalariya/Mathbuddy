"""Download verified, prequantized Q4 weights. Never load or quantize a model."""
import hashlib
from pathlib import Path
import time
import zipfile

import httpx

ROOT = Path(__file__).resolve().parents[2]
MODEL_ROOT = ROOT / "models" / "glm-ocr-q4"
RUNTIME = ROOT / "tools" / "llama-glm-q4"
REPO = "https://huggingface.co/octopusmegalopod/some-glmocr-ggufs/resolve/318c473f8b924c4ccbd748d85ecc22a76d499c50/"
FILES = [
    (MODEL_ROOT / "glmocr-Q4_K_M.gguf", REPO + "glmocr-Q4_K_M.gguf", "adff1dcee05539bb19b9a3e64fea6e39f9c9eab46f2bab6357c7743246c13163"),
    (MODEL_ROOT / "mmproj-glmocr-Q4_1.gguf", REPO + "mmproj-glmocr-Q4_1.gguf", "fed429b470908641ed3c26074f6152bbe70341d15b47d512b3ece40618b06d25"),
    (RUNTIME / "runtime.zip", "https://github.com/ggml-org/llama.cpp/releases/download/b11718/llama-b11718-bin-win-vulkan-x64.zip", "237e5736031a9cdcf9eff54e1f4e9bd871945de1d56ec542ecb9ebaf8d45bdb6"),
]


def digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def main() -> None:
    for path, url, expected in FILES:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.is_file() and digest(path) == expected:
            print(f"Verified {path.name}", flush=True)
            continue
        partial = path.with_suffix(path.suffix + ".download")
        print(f"Downloading {path.name} (no model is loaded)", flush=True)
        # Small HTTP ranges avoid buffering/stalled large downloads on this link.
        offset = partial.stat().st_size if partial.exists() else 0
        with partial.open("ab") as destination:
            while True:
                end = offset + 1024 * 1024 - 1
                # Fresh connections avoid this network's stalled CDN keep-alives.
                for attempt in range(3):
                    try:
                        response = httpx.get(url + f"?part={offset}&fresh={time.time_ns()}",
                                             headers={"Range": f"bytes={offset}-{end}"},
                                             follow_redirects=True, timeout=10, trust_env=False)
                        response.raise_for_status()
                        break
                    except httpx.HTTPError:
                        if attempt == 2:
                            raise RuntimeError(f"Download interrupted at {offset} bytes. Run setup-local-ocr.ps1 to resume.") from None
                if offset and response.status_code != 206:
                    raise RuntimeError("Download server did not honor resume range")
                if response.status_code == 206 and not response.headers.get("content-range", "").startswith(f"bytes {offset}-"):
                    raise RuntimeError("Download server returned the wrong range")
                total = int(response.headers.get("content-range", "/0").split("/")[-1]) if response.status_code == 206 else int(response.headers["content-length"])
                destination.write(response.content)
                before, offset = offset, offset + len(response.content)
                destination.flush()
                if before // (16 * 1024 * 1024) != offset // (16 * 1024 * 1024):
                    print(f"{path.name}: {offset * 100 // total}%", flush=True)
                if offset >= total:
                    break
        if digest(partial) != expected:
            raise RuntimeError(f"Checksum mismatch for {path.name}; installation stopped.")
        partial.replace(path)
        print(f"Verified {path.name}", flush=True)
    with zipfile.ZipFile(RUNTIME / "runtime.zip") as archive:
        for member in archive.infolist():
            target = (RUNTIME / member.filename).resolve()
            if not target.is_relative_to(RUNTIME.resolve()):
                raise RuntimeError("Invalid runtime archive path")
        archive.extractall(RUNTIME)
    print("4-bit files are installed. GPU inference starts only when Math Buddy reads an image.", flush=True)


if __name__ == "__main__":
    main()
