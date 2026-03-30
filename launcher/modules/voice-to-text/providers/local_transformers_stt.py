#!/usr/bin/env python3
# @version 1.1.3 - March 5, 2026
# @copyright 2026 Pseudo SF
import argparse
import base64
import io
import json
import sys
import traceback
import wave


def _safe_json(obj):
    try:
        return json.dumps(obj, ensure_ascii=False)
    except Exception:
        return json.dumps({"success": False, "error": "json_encode_failed"})


def _print_json(obj):
    sys.stdout.write(_safe_json(obj) + "\n")
    sys.stdout.flush()


def _looks_like_whisper(model_name):
    value = str(model_name or "").strip().lower()
    return "whisper" in value


def _resolve_torch_dtype(dtype_name):
    try:
        import torch
    except Exception:
        return None
    name = str(dtype_name or "auto").strip().lower()
    if name in ("", "auto"):
        return None
    if name == "float16":
        return torch.float16
    if name == "float32":
        return torch.float32
    if name == "bfloat16":
        return torch.bfloat16
    return None


def _resolve_pipeline_device(req):
    try:
        import torch
    except Exception:
        return -1, "cpu"
    requested = str(req.get("device") or "cpu").strip().lower()
    if requested == "cuda":
        if torch.cuda.is_available():
            idx = int(req.get("device_index") or 0)
            return idx, f"cuda:{idx}"
        return -1, "cpu"
    if requested == "mps":
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return "mps", "mps"
        return -1, "cpu"
    return -1, "cpu"


def _decode_wav_from_base64(audio_base64):
    try:
        import numpy as np
    except Exception as exc:
        raise RuntimeError(f"numpy unavailable: {exc}")
    raw = str(audio_base64 or "").strip()
    if not raw:
        raise RuntimeError("audio payload is empty")
    try:
        audio_bytes = base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise RuntimeError(f"invalid base64 audio payload: {exc}")

    with wave.open(io.BytesIO(audio_bytes), "rb") as wav_file:
        channels = int(wav_file.getnchannels() or 1)
        sample_width = int(wav_file.getsampwidth() or 2)
        sample_rate = int(wav_file.getframerate() or 16000)
        frame_count = int(wav_file.getnframes() or 0)
        pcm = wav_file.readframes(frame_count)

    if sample_width == 1:
        arr = np.frombuffer(pcm, dtype=np.uint8).astype(np.float32)
        arr = (arr - 128.0) / 128.0
    elif sample_width == 2:
        arr = np.frombuffer(pcm, dtype=np.int16).astype(np.float32)
        arr = arr / 32768.0
    elif sample_width == 4:
        arr = np.frombuffer(pcm, dtype=np.int32).astype(np.float32)
        arr = arr / 2147483648.0
    else:
        raise RuntimeError(f"unsupported WAV sample width: {sample_width}")

    if channels > 1:
        usable = (arr.size // channels) * channels
        arr = arr[:usable].reshape(-1, channels).mean(axis=1)

    return arr.astype(np.float32), sample_rate


def _extract_transcript(output):
    if output is None:
        return ""
    if isinstance(output, str):
        return output.strip()
    if isinstance(output, list):
        for item in output:
            text = _extract_transcript(item)
            if text:
                return text
        return ""
    if isinstance(output, dict):
        text = str(output.get("text") or output.get("generated_text") or "").strip()
        if text:
            return text
    return ""


def _build_asr_pipeline(model_name, req):
    try:
        import torch
        from transformers import pipeline
    except Exception as exc:
        raise RuntimeError(
            f"local transformers STT unavailable: {exc}. Install with: pip install transformers torch numpy"
        )

    pipeline_device, device_label = _resolve_pipeline_device(req)
    torch_dtype = _resolve_torch_dtype(req.get("dtype"))
    hf_token = str(req.get("hf_token") or "").strip()
    kwargs = {
        "task": "automatic-speech-recognition",
        "model": model_name,
        "device": pipeline_device,
        "trust_remote_code": True,
    }
    if torch_dtype is not None:
        kwargs["torch_dtype"] = torch_dtype

    errors = []
    if hf_token:
        for token_key in ("token", "use_auth_token"):
            try:
                with_token = dict(kwargs)
                with_token[token_key] = hf_token
                pipe = pipeline(**with_token)
                return pipe, device_label
            except TypeError as exc:
                errors.append(str(exc))
            except Exception as exc:
                errors.append(str(exc))
    try:
        return pipeline(**kwargs), device_label
    except Exception as exc:
        if errors:
            raise RuntimeError(f"{exc} | {' | '.join(errors[-2:])}")
        raise


def _transcribe(req, cache):
    model_name = str(req.get("model") or "openai/whisper-small").strip()
    if not model_name:
        model_name = "openai/whisper-small"

    audio, sample_rate = _decode_wav_from_base64(req.get("audioBase64"))
    cache_key = (
        model_name,
        str(req.get("device") or "cpu").strip().lower(),
        str(req.get("dtype") or "auto").strip().lower(),
    )
    pipe = cache.get(cache_key)
    device_label = "cpu"
    if pipe is None:
        pipe, device_label = _build_asr_pipeline(model_name, req)
        cache.clear()
        cache[cache_key] = pipe
    max_new_tokens = int(req.get("max_new_tokens") or 256)

    call_kwargs = {
        "chunk_length_s": float(req.get("chunk_length_s") or 20.0),
        "return_timestamps": bool(req.get("return_timestamps") is True),
    }
    if _looks_like_whisper(model_name):
        call_kwargs["generate_kwargs"] = {
            "max_new_tokens": max_new_tokens
        }
    try:
        output = pipe({"array": audio, "sampling_rate": sample_rate}, **call_kwargs)
    except TypeError:
        # Some models don't accept the full kwargs set.
        output = pipe({"array": audio, "sampling_rate": sample_rate})
    transcript = _extract_transcript(output)
    if not transcript:
        raise RuntimeError("STT returned no transcript text")
    return {
        "success": True,
        "transcript": transcript,
        "model": model_name,
        "provider": "local-transformers",
        "device": device_label
    }


def _handle_request(line, cache):
    try:
        req = json.loads(line)
    except Exception as exc:
        return {"success": False, "error": f"invalid_json: {exc}"}

    req_id = req.get("id")
    if req.get("prewarm") is True:
        model_name = str(req.get("model") or "openai/whisper-small").strip()
        if not model_name:
            model_name = "openai/whisper-small"
        _build_asr_pipeline(model_name, req)
        return {
            "id": req_id,
            "success": True,
            "warmed": True,
            "model": model_name,
            "provider": "local-transformers"
        }

    result = _transcribe(req, cache)
    result["id"] = req_id
    return result


def run_server():
    cache = {}
    for raw in sys.stdin:
        line = str(raw or "").strip()
        if not line:
            continue
        try:
            result = _handle_request(line, cache)
        except Exception as exc:
            err = str(exc) or exc.__class__.__name__
            tb = traceback.format_exc(limit=2)
            try:
                req = json.loads(line)
                req_id = req.get("id")
            except Exception:
                req_id = None
            result = {
                "id": req_id,
                "success": False,
                "error": err,
                "trace": tb[-1200:],
            }
        _print_json(result)


def run_single(args):
    payload_raw = str(args.payload or "").strip()
    if payload_raw:
        payload = json.loads(payload_raw)
    else:
        payload = {"id": 1, "model": args.model, "audioBase64": args.audio_base64}
    result = _handle_request(json.dumps(payload), {})
    _print_json(result)


def main():
    parser = argparse.ArgumentParser(description="Local Transformers STT worker")
    parser.add_argument("--serve", action="store_true", help="Run JSONL worker server over stdin/stdout")
    parser.add_argument("--model", default="openai/whisper-small")
    parser.add_argument("--audio-base64", default="")
    parser.add_argument("--payload", default="")
    args = parser.parse_args()
    if args.serve:
        run_server()
        return
    run_single(args)


if __name__ == "__main__":
    main()
