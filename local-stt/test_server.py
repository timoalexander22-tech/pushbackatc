import os
import unittest
from unittest.mock import patch

from server import choose_device, parse_multipart


class DeviceSelectionTests(unittest.TestCase):
    def test_cpu_is_default_without_detectable_nvidia_gpu(self):
        self.assertEqual(
            choose_device("base.en", "auto", None),
            ("cpu", "int8", "NVIDIA GPU or nvidia-smi unavailable; using CPU"),
        )

    def test_small_model_uses_cpu_when_vram_is_below_threshold(self):
        with patch.dict(os.environ, {"VGC_STT_MIN_VRAM_MB": "2048"}):
            device = choose_device("small.en", "auto", (0, 2400))
        self.assertEqual(device[:2], ("cpu", "int8"))
        self.assertIn("2560 MB required", device[2])

    def test_gpu_is_used_only_after_vram_threshold_is_met(self):
        with patch.dict(os.environ, {"VGC_STT_MIN_VRAM_MB": "2048"}):
            device = choose_device("small.en", "auto", (1, 4096))
        self.assertEqual(device[:2], ("cuda:1", "int8_float16"))

    def test_configured_vram_floor_cannot_be_bypassed(self):
        with patch.dict(os.environ, {"VGC_STT_MIN_VRAM_MB": "4096"}):
            device = choose_device("base.en", "auto", (0, 3000))
        self.assertEqual(device[:2], ("cpu", "int8"))
        self.assertIn("4096 MB required", device[2])

    def test_cpu_is_the_default_device_preference(self):
        with patch.dict(os.environ, {}, clear=True):
            preferred = os.environ.get("VGC_STT_DEVICE", "cpu")
        self.assertEqual(choose_device("base.en", preferred, (0, 4096))[:2], ("cpu", "int8"))

    def test_explicit_cpu_setting_never_uses_gpu(self):
        self.assertEqual(choose_device("small", "cpu", (0, 16384))[:2], ("cpu", "int8"))


class MultipartTests(unittest.TestCase):
    def test_reads_model_prompt_and_audio_fields(self):
        boundary = "local-stt-boundary"
        body = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\nsmall.en\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"radio.wav\"\r\n"
            "Content-Type: audio/wav\r\n\r\nRIFF-audio-bytes\r\n"
            f"--{boundary}--\r\n"
        ).encode()
        fields = parse_multipart(f"multipart/form-data; boundary={boundary}", body)
        self.assertEqual(fields["model"], b"small.en")
        self.assertEqual(fields["file"], b"RIFF-audio-bytes")


if __name__ == "__main__":
    unittest.main()
