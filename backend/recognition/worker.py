"""JSON-lines worker run only in the existing recognition environment.

Vendor imports and prints are redirected to stderr; stdout is the protocol.
No third-party code or recognition environment is modified.
"""

from contextlib import redirect_stdout
import json
import os
from pathlib import Path
import sys
import time
import traceback


def watch_windows_parent() -> None:
    """Release model memory even if Windows abruptly closes the API console."""
    if os.name != "nt" or "MATHBUDDY_PARENT_PID" not in os.environ:
        return
    import ctypes
    import threading

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
    kernel.OpenProcess.restype = ctypes.c_void_p
    kernel.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    handle = kernel.OpenProcess(0x00100000, False, int(os.environ["MATHBUDDY_PARENT_PID"]))
    if handle:
        def wait() -> None:
            kernel.WaitForSingleObject(handle, 0xFFFFFFFF)
            kernel.CloseHandle(handle)
            os._exit(0)
        threading.Thread(target=wait, daemon=True).start()


def main() -> None:
    watch_windows_parent()
    root = Path(__file__).resolve().parents[2]
    vendor = root / "tools" / "UniMERNet"
    sys.path.insert(0, str(vendor))
    processor = None
    for line in sys.stdin:
        try:
            request = json.loads(line)
            started = time.monotonic()
            with redirect_stdout(sys.stderr):
                if processor is None:
                    from demo import ImageProcessor
                    import torch
                    from PIL import Image

                    processor = ImageProcessor(str(vendor / "configs" / "demo.yaml"))
                    processor.model.eval()
                with Image.open(request["path"]) as source:
                    image = processor.vis_processor(source.convert("RGB")).unsqueeze(0).to(processor.device)
                with torch.inference_mode():
                    output = processor.model.generate({"image": image})
                result = {"latex": output["pred_str"][0], "device": str(processor.device),
                          "elapsed_ms": round((time.monotonic() - started) * 1000)}
            print(json.dumps(result), flush=True)
        except Exception:
            traceback.print_exc(file=sys.stderr)
            print(json.dumps({"error": "Local recognition failed. Check artifacts/recognition.log; you can enter the math manually."}), flush=True)


if __name__ == "__main__":
    main()
