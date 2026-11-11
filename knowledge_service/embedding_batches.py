"""Bound Graphiti embedding batches to the private model proxy request limits."""
import json

MAX_ITEMS = 32
# The proxy rejects JSON request bodies above 150,000 characters.
# Leave room for the model name and other request fields.
MAX_INPUT_JSON_CHARS = 140_000


def embedding_batches(texts):
    batch = []
    batch_chars = 0
    for text in texts:
        if not isinstance(text, str) or not text or len(text.encode("utf-16-le")) // 2 > 12_000:
            raise ValueError("Invalid Graphiti embedding input")
        # ensure_ascii makes this a conservative estimate of JSON.stringify length.
        chars = len(json.dumps(text, ensure_ascii=True)) + 1
        if chars > MAX_INPUT_JSON_CHARS:
            raise ValueError("Graphiti embedding input exceeds request size")
        if batch and (len(batch) >= MAX_ITEMS or batch_chars + chars > MAX_INPUT_JSON_CHARS):
            yield batch
            batch = []
            batch_chars = 0
        batch.append(text)
        batch_chars += chars
    if batch:
        yield batch
