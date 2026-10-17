from io import BytesIO
import unittest
from unittest.mock import AsyncMock, Mock, patch

from PIL import Image, ImageDraw

from backend.recognition.service import RecognitionError, RecognitionService, prepare_image


def image_bytes(image: Image.Image, format: str = "PNG") -> bytes:
    output = BytesIO()
    image.save(output, format=format)
    return output.getvalue()


class ImagePreparationTests(unittest.TestCase):
    def test_crops_whitespace_with_padding(self):
        image = Image.new("RGB", (1000, 300), "white")
        ImageDraw.Draw(image).rectangle((400, 100, 600, 160), fill="black")
        with Image.open(BytesIO(prepare_image(image_bytes(image)))) as prepared:
            self.assertEqual(prepared.size, (241, 101))

    def test_alpha_is_flattened_on_white(self):
        image = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
        ImageDraw.Draw(image).line((30, 30, 70, 70), fill="black", width=3)
        with Image.open(BytesIO(prepare_image(image_bytes(image)))) as prepared:
            self.assertEqual(prepared.mode, "RGB")
            self.assertEqual(prepared.getpixel((0, 0)), (255, 255, 255))

    def test_blank_is_not_sent_to_model(self):
        with self.assertRaisesRegex(RecognitionError, "blank"):
            prepare_image(image_bytes(Image.new("RGB", (50, 50), "white")))

    def test_malformed_is_rejected(self):
        with self.assertRaises(RecognitionError) as caught:
            prepare_image(b"not an image")
        self.assertEqual(caught.exception.status_code, 415)

    def test_unsupported_raster_format(self):
        with self.assertRaises(RecognitionError) as caught:
            prepare_image(image_bytes(Image.new("RGB", (50, 50), "black"), "GIF"))
        self.assertEqual(caught.exception.status_code, 415)

    def test_pixel_limit(self):
        with patch("backend.recognition.service.MAX_PIXELS", 20):
            with self.assertRaises(RecognitionError) as caught:
                prepare_image(image_bytes(Image.new("RGB", (10, 10), "black")))
            self.assertEqual(caught.exception.status_code, 413)


class WorkerBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_cleanup_when_worker_has_already_exited(self):
        service = RecognitionService()
        service.process = Mock(returncode=None)
        service.process.kill.side_effect = ProcessLookupError()
        service.process.wait = AsyncMock(return_value=0)
        await service.close()
        self.assertIsNone(service.process)

    async def test_missing_setup_has_actionable_error(self):
        service = RecognitionService()
        with patch.object(service, "configuration", return_value={"configured": False}):
            with self.assertRaisesRegex(RecognitionError, "type"):
                await service.recognize(b"anything")

    async def test_busy_worker_rejects_queue_without_loading_model(self):
        service = RecognitionService()
        await service.lock.acquire()
        try:
            with patch.object(service, "configuration", return_value={"configured": True}):
                with self.assertRaises(RecognitionError) as caught:
                    await service.recognize(image_bytes(Image.new("RGB", (10, 10), "black")))
                self.assertEqual(caught.exception.status_code, 429)
        finally:
            service.lock.release()


if __name__ == "__main__":
    unittest.main()
