"""Offline regression tests for Graphiti embedding request batching."""
import unittest

from embedding_batches import embedding_batches


class EmbeddingBatchTests(unittest.TestCase):
    def test_empty_and_exact_boundary(self):
        self.assertEqual(list(embedding_batches([])), [])
        self.assertEqual(list(embedding_batches(["x"] * 32)), [["x"] * 32])

    def test_splits_over_32_without_changing_order(self):
        texts = [f"entity-{i}" for i in range(71)]
        batches = list(embedding_batches(texts))
        self.assertEqual([len(batch) for batch in batches], [32, 32, 7])
        self.assertEqual([text for batch in batches for text in batch], texts)

    def test_splits_large_payload_before_proxy_body_limit(self):
        texts = ["x" * 12_000 for _ in range(14)]
        batches = list(embedding_batches(texts))
        self.assertEqual([len(batch) for batch in batches], [11, 3])

    def test_counts_non_ascii_conservatively(self):
        texts = ["新闻" * 3_000 for _ in range(4)]
        self.assertEqual([len(batch) for batch in embedding_batches(texts)], [3, 1])

    def test_rejects_invalid_single_input(self):
        for text in ["", "x" * 12_001]:
            with self.subTest(text_length=len(text)), self.assertRaises(ValueError):
                list(embedding_batches([text]))


if __name__ == "__main__":
    unittest.main()
