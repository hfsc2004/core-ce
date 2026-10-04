"""Inspect installed llama.cpp APIs; no model conversion or tensor remapping here."""
import contextlib
import json
import os
from pathlib import Path
import runpy
import sys

root, action, target = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
sys.path.insert(0, str(root))
sys.path.insert(1, str(root / "gguf-py"))

if action == "verify-rwkv-vocabulary":
    # Compare a supplemental data asset with the source tokenizer. No tensor
    # handling, tokenizer execution, token reordering, or vocabulary generation.
    import ast
    vocab_file = Path(sys.argv[4])
    tokenizer = json.loads((target / "tokenizer.json").read_text(encoding="utf-8"))
    config = json.loads((target / "config.json").read_text(encoding="utf-8"))
    model = tokenizer.get("model", {})
    pre = tokenizer.get("pre_tokenizer", {})
    decoder = tokenizer.get("decoder", {})
    if (model.get("type") != "WordPiece" or model.get("unk_token") != "<|endoftext|>"
            or model.get("continuing_subword_prefix") != "" or tokenizer.get("normalizer") is not None
            or pre.get("type") != "ByteLevel" or pre.get("add_prefix_space") is not False
            or pre.get("use_regex") is not False or decoder.get("type") != "ByteLevel"):
        raise ValueError("Source tokenizer does not have the verified RWKV World byte-token semantics")
    vocab = model.get("vocab", {})
    if (not isinstance(vocab, dict) or not vocab or any(type(i) is not int for i in vocab.values())
            or set(vocab.values()) != set(range(len(vocab))) or vocab.get("<|endoftext|>") != 0
            or config.get("vocab_size") != len(vocab)):
        raise ValueError("Source vocabulary IDs or size do not match the required tokenizer layout")
    if any(config.get(name, 0) not in (None, 0) for name in ("bos_token_id", "eos_token_id", "pad_token_id")):
        raise ValueError("Source special token IDs do not match the supplemental vocabulary")
    added = tokenizer.get("added_tokens", [])
    if any(t.get("id") != 0 or t.get("content") != "<|endoftext|>" or t.get("special") is not True for t in added):
        raise ValueError("Source has additional special tokens not represented by the supplemental vocabulary")
    values = list(range(33, 127)) + list(range(161, 173)) + list(range(174, 256))
    chars = list(values)
    extra = 0
    for byte in range(256):
        if byte not in values:
            values.append(byte)
            chars.append(256 + extra)
            extra += 1
    byte_decoder = dict(zip(map(chr, chars), values))
    by_id = {index: token for token, index in vocab.items()}
    count = 0
    seen = set()
    for line in vocab_file.read_text(encoding="utf-8").splitlines():
        index_text, rest = line.split(" ", 1)
        token_text, length_text = rest.rsplit(" ", 1)
        index, length = int(index_text), int(length_text)
        token = ast.literal_eval(token_text)
        raw = token.encode("utf-8") if isinstance(token, str) else token
        if index != count + 1 or not isinstance(raw, bytes) or len(raw) != length or raw in seen:
            raise ValueError("Supplemental vocabulary has invalid IDs, lengths, or duplicate tokens")
        try:
            actual = bytes(byte_decoder[char] for char in by_id[index])
        except (KeyError, TypeError) as error:
            raise ValueError(f"Source vocabulary cannot represent token {index}") from error
        if actual != raw:
            raise ValueError(f"Supplemental vocabulary differs from source token ID {index}")
        seen.add(raw)
        count += 1
    if not count or any(bytes([byte]) not in seen for byte in range(256)):
        raise ValueError("Supplemental vocabulary is missing byte tokens")
    for index in range(count + 1, len(vocab)):
        if by_id[index] != f"\ue000{index}\ue001":
            raise ValueError(f"Source token ID {index} is not an unused placeholder")
    print(json.dumps({"compatible": True, "matched_tokens": count, "special_token_id": 0,
                      "unused_token_count": len(vocab) - count - 1, "method": "exact-token-id-and-byte-comparison"}))
elif action == "probe":
    config = json.loads(target.read_text())
    # Both the monolithic and modular upstream converters export their registry.
    with contextlib.redirect_stdout(sys.stderr):
        api = runpy.run_path(str(root / "convert_hf_to_gguf.py"), run_name="psf_probe")
        if "get_model_architecture" in api and "get_model_class" in api:
            try:
                arch = api["get_model_architecture"](config, api["ModelType"].TEXT)
                cls = api["get_model_class"](arch)
            except (NotImplementedError, ValueError):
                arch = config.get("architectures", [None])[0]
                cls = None
        elif "Model" in api and hasattr(api["Model"], "from_model_architecture"):
            arch = config.get("architectures", [None])[0]
            if not arch:
                raise ValueError("Installed converter cannot resolve this configuration")
            try:
                cls = api["Model"].from_model_architecture(arch)
            except NotImplementedError:
                cls = None
        else:
            raise RuntimeError("Installed converter registry interface is unavailable; update conversion tools")
    import gguf
    gguf_arch = gguf.MODEL_ARCH_NAMES[cls.model_arch] if cls else None
    print(json.dumps({"supported": cls is not None, "architecture": arch, "gguf_architecture": gguf_arch}))
elif action == "validate":
    import gguf
    reader = gguf.GGUFReader(str(target))
    arch = reader.get_field("general.architecture")
    ftype = reader.get_field("general.file_type")
    if arch is None or ftype is None or not reader.tensors:
        raise ValueError("Missing GGUF architecture, file type, or tensors")
    architecture = arch.contents()
    file_type = int(ftype.contents())
    size = os.path.getsize(target)
    for tensor in reader.tensors:
        if tensor.n_bytes <= 0 or tensor.data_offset + tensor.n_bytes > size:
            raise ValueError("Incomplete GGUF tensor: " + tensor.name)
    # Upstream enum is authoritative for unquantized input types.
    floating = [int(getattr(gguf.LlamaFileType, name)) for name in
                ("ALL_F32", "MOSTLY_F16", "MOSTLY_BF16") if hasattr(gguf.LlamaFileType, name)]
    floating_tensors = [getattr(gguf.GGMLQuantizationType, name) for name in
                        ("F32", "F16", "BF16", "F64") if hasattr(gguf.GGMLQuantizationType, name)]
    print(json.dumps({"architecture": architecture, "file_type": file_type,
                      "quantization": gguf.LlamaFileType(file_type).name.removeprefix("MOSTLY_"),
                      "unquantized": file_type in floating and all(t.tensor_type in floating_tensors for t in reader.tensors),
                      "tensor_count": len(reader.tensors)}))
elif action == "source-types":
    # Read only tensor metadata, using upstream dependencies; never import HF code.
    types = set()
    files = list(target.glob("*.safetensors"))
    if files:
        from safetensors import safe_open
        for file in files:
            with safe_open(str(file), framework="pt", device="cpu") as tensors:
                for name in tensors.keys():
                    types.add(str(tensors.get_slice(name).get_dtype()))
    else:
        import torch
        for file in target.glob("pytorch_model*.bin"):
            state = torch.load(str(file), map_location="cpu", mmap=True, weights_only=True)
            types.update(str(value.dtype) for value in state.values() if isinstance(value, torch.Tensor))
            del state
    print(json.dumps({"datatypes": sorted(types)}))
else:
    raise ValueError("Unknown inspection action")
