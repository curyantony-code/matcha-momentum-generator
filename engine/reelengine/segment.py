"""Person masks from macOS's own Vision framework (VNGeneratePersonSegmentationRequest), for text that sits BEHIND
the speaker: a title is drawn, then the person is put back over it.

Apple's model ships with macOS (the one behind Portrait mode), so nothing is downloaded and it runs on the Neural
Engine. Reached through pyobjc (MIT). Not on macOS, or older than macOS 12: `available()` is False and the text is
simply drawn in front, as before. (benpiper's auto-video-editor uses Robust Video Matting for the same job; that
model is GPL and built for Nvidia cards, so it is not used here.)
"""
from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np


@lru_cache(maxsize=1)
def available() -> bool:
    if sys.platform != "darwin":
        return False
    try:
        import Vision  # noqa: F401
        return hasattr(Vision, "VNGeneratePersonSegmentationRequest")
    except Exception:
        return False


def person_mask(image_path: Path, quality: str = "balanced") -> Optional[np.ndarray]:
    """A float mask in [0, 1] (1 = the person) the size of the image, or None when Vision can't."""
    if not available():
        return None
    import Quartz
    import Vision
    from Foundation import NSURL
    from PIL import Image

    req = Vision.VNGeneratePersonSegmentationRequest.alloc().initWithCompletionHandler_(None)
    req.setQualityLevel_({"fast": Vision.VNGeneratePersonSegmentationRequestQualityLevelFast,
                          "accurate": Vision.VNGeneratePersonSegmentationRequestQualityLevelAccurate}.get(
        quality, Vision.VNGeneratePersonSegmentationRequestQualityLevelBalanced))
    req.setOutputPixelFormat_(1278226488)  # kCVPixelFormatType_OneComponent8 ('L008')
    url = NSURL.fileURLWithPath_(str(image_path))
    handler = Vision.VNImageRequestHandler.alloc().initWithURL_options_(url, None)
    ok, _err = handler.performRequests_error_([req], None)
    if not ok or not req.results():
        return None
    buf = req.results()[0].pixelBuffer()
    Quartz.CVPixelBufferLockBaseAddress(buf, 1)
    try:
        h, w = Quartz.CVPixelBufferGetHeight(buf), Quartz.CVPixelBufferGetWidth(buf)
        stride = Quartz.CVPixelBufferGetBytesPerRow(buf)
        raw = Quartz.CVPixelBufferGetBaseAddress(buf).as_buffer(stride * h)
        mask = np.frombuffer(raw, dtype=np.uint8).reshape(h, stride)[:, :w].copy()
    finally:
        Quartz.CVPixelBufferUnlockBaseAddress(buf, 1)
    with Image.open(image_path) as im:
        size = im.size
    return np.asarray(Image.fromarray(mask).resize(size, Image.BILINEAR), dtype=np.float32) / 255.0
