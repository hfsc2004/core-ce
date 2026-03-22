#!/usr/bin/env python3
# @version 1.1.2 - March 5, 2026
# @copyright 2026 Global Science Network
import base64
import io
import json
import os
import sys
import wave

import local_transformers_tts_runtime as tts_runtime
from local_transformers_tts_runtime import (
    _build_generator,
    _evict_chatterbox_cache_entries,
    _extract_audio_and_rate,
    _looks_like_chatterbox,
    _normalize_audio_list,
    _resolve_pipeline_device,
    _resolve_runtime_device_label,
    _resolve_torch_dtype,
    _run_chatterbox_generator,
    _run_dia_generator,
    _run_pipeline_generator,
)


def _float_to_pcm16(samples):
    out = bytearray()
    for sample in samples:
        value = max(-1.0, min(1.0, float(sample)))
        iv = int(value * 32767.0)
        out.extend(int(iv).to_bytes(2, byteorder="little", signed=True))
    return bytes(out)


def _write_wav(audio_samples, sample_rate):
    lead_in_ms = 120
    lead_samples = int(max(0, lead_in_ms) * int(sample_rate) / 1000)
    if lead_samples > 0:
        audio_samples = ([0.0] * lead_samples) + list(audio_samples)
    pcm = _float_to_pcm16(audio_samples)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(int(sample_rate))
        wf.writeframes(pcm)
    return buffer.getvalue()


def _emit(payload):
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


def _synthesize_request(req, cache=None):
    global _PSF_HF_TOKEN
    _PSF_HF_TOKEN = str(req.get("hf_token") or "").strip()
    if _PSF_HF_TOKEN:
        os.environ["HF_TOKEN"] = _PSF_HF_TOKEN
        os.environ["HF_HUB_TOKEN"] = _PSF_HF_TOKEN
        os.environ["HUGGINGFACE_HUB_TOKEN"] = _PSF_HF_TOKEN
    text = str(req.get("text") or "").strip()
    model = str(req.get("model") or "facebook/mms-tts-eng").strip()
    device = str(req.get("device") or "cpu").strip().lower()
    if not text:
        return {"success": False, "error": "empty text"}
    pipeline_device, device_error = _resolve_pipeline_device(device)
    if device_error:
        return {"success": False, "error": device_error}
    if _looks_like_chatterbox(model) and str(device).startswith("cuda") and ":" not in str(device):
        try:
            import torch
            count = int(torch.cuda.device_count())
            if tts_runtime._PSF_CHATTERBOX_CUDA_IDX is not None and 0 <= int(tts_runtime._PSF_CHATTERBOX_CUDA_IDX) < count:
                pipeline_device = int(tts_runtime._PSF_CHATTERBOX_CUDA_IDX)
            elif isinstance(pipeline_device, int) and pipeline_device >= 0:
                tts_runtime._PSF_CHATTERBOX_CUDA_IDX = int(pipeline_device)
        except Exception:
            pass

    runtime_device = _resolve_runtime_device_label(device, pipeline_device)
    torch_dtype = _resolve_torch_dtype(req.get("dtype"), pipeline_device)

    cache_key = (model, str(pipeline_device), str(req.get("dtype") or "auto").lower())
    generator = None
    task_name = ""
    kind = "pipeline"
    if cache is not None and cache_key in cache:
        entry = cache.get(cache_key) or {}
        generator = entry.get("generator")
        task_name = entry.get("task", "")
        kind = entry.get("kind", "pipeline")
    if generator is None:
        generator, build_error, task_name, kind = _build_generator(
            model,
            pipeline_device,
            runtime_device,
            torch_dtype=torch_dtype,
        )
        if build_error:
            return {"success": False, "error": build_error}
        if cache is not None:
            if kind == "chatterbox":
                _evict_chatterbox_cache_entries(cache, model, keep_key=None)
            cache[cache_key] = {"generator": generator, "task": task_name, "kind": kind}

    generation_kwargs = {
        "speaking_rate": _safe_number(req.get("speaking_rate"), 1.0),
        "noise_scale": _safe_number(req.get("noise_scale"), 0.667),
        "noise_scale_duration": _safe_number(req.get("noise_scale_duration"), 0.8),
    }

    try:
        if kind == "chatterbox":
            out = _run_chatterbox_generator(generator, text, req)
            sample_rate = int(getattr(generator, "sr", 24000) or 24000)
            audio = _normalize_audio_list(out)
            if audio is None:
                return {"success": False, "error": "chatterbox returned unsupported audio output"}
        elif kind == "dia":
            audio_out, sample_rate = _run_dia_generator(generator, text, req)
            audio = _normalize_audio_list(audio_out)
            if audio is None:
                return {"success": False, "error": "dia returned unsupported audio output"}
        else:
            out = _run_pipeline_generator(generator, text, generation_kwargs)
            audio, sample_rate = _extract_audio_and_rate(out, fallback_rate=22050)
            if audio is None:
                return {"success": False, "error": "pipeline returned no audio field"}
    except Exception as exc:
        # If CUDA was requested but runtime kernels are unavailable for this GPU,
        # transparently retry on CPU so TTS still works.
        err_text = str(exc).lower()
        is_cuda_pipeline = isinstance(pipeline_device, int) and pipeline_device >= 0
        is_fp_instability = (
            "discriminant has negative values" in err_text
            or "nan" in err_text
            or "inf" in err_text
        )
        is_cuda_runtime_issue = (
            "no kernel image is available" in err_text
            or "cudaerrornokernelimagefordevice" in err_text
            or "cuda error" in err_text
            or "cuda out of memory" in err_text
            or "out of memory" in err_text
        )

        # Retry path 1: same GPU, safer float32 precision for unstable FP16/BF16 runs.
        if is_cuda_pipeline and kind == "pipeline" and is_fp_instability:
            f32_key = (model, str(pipeline_device), "float32")
            f32_generator = None
            if cache is not None and f32_key in cache:
                f32_entry = cache.get(f32_key) or {}
                f32_generator = f32_entry.get("generator")
            if f32_generator is None:
                f32_generator, build_error, f32_task, f32_kind = _build_generator(
                    model,
                    pipeline_device,
                    runtime_device,
                    torch_dtype=_resolve_torch_dtype("float32", pipeline_device),
                )
                if build_error:
                    return {"success": False, "error": f"generation failed: {build_error}"}
                if cache is not None:
                    cache[f32_key] = {"generator": f32_generator, "task": f32_task, "kind": f32_kind}
            try:
                out = _run_pipeline_generator(f32_generator, text, generation_kwargs)
                audio, sample_rate = _extract_audio_and_rate(out, fallback_rate=22050)
                if audio is None:
                    return {"success": False, "error": "generation failed: audio output shape unsupported"}
            except Exception as exc2:
                err_text = str(exc2).lower()
                is_fp_instability = (
                    "discriminant has negative values" in err_text
                    or "nan" in err_text
                    or "inf" in err_text
                )
                is_cuda_runtime_issue = (
                    "no kernel image is available" in err_text
                    or "cudaerrornokernelimagefordevice" in err_text
                    or "cuda error" in err_text
                    or "cuda out of memory" in err_text
                    or "out of memory" in err_text
                )
                # If FP instability persists even after float32 retry, force CPU rescue path.
                if not is_cuda_runtime_issue and not is_fp_instability:
                    return {"success": False, "error": f"generation failed: {exc2}"}

        # Retry path 2: CPU fallback for CUDA runtime failures OR persistent FP instability.
        if is_cuda_pipeline and (is_cuda_runtime_issue or is_fp_instability):
            cpu_key = (model, "-1", str(req.get("dtype") or "auto").lower())
            cpu_generator = None
            cpu_kind = kind
            if cache is not None and cpu_key in cache:
                cpu_entry = cache.get(cpu_key) or {}
                cpu_generator = cpu_entry.get("generator")
                cpu_kind = cpu_entry.get("kind", cpu_kind)
            if cpu_generator is None:
                cpu_generator, build_error, cpu_task, cpu_kind = _build_generator(
                    model,
                    -1,
                    "cpu",
                    torch_dtype=_resolve_torch_dtype(req.get("dtype"), -1),
                )
                if build_error:
                    return {"success": False, "error": f"generation failed: {build_error}"}
                if cache is not None:
                    cache[cpu_key] = {"generator": cpu_generator, "task": cpu_task, "kind": cpu_kind}
            if cpu_kind == "chatterbox":
                out = _run_chatterbox_generator(cpu_generator, text, req)
                sample_rate = int(getattr(cpu_generator, "sr", 24000) or 24000)
                audio = _normalize_audio_list(out)
            elif cpu_kind == "dia":
                out, sample_rate = _run_dia_generator(cpu_generator, text, req)
                audio = _normalize_audio_list(out)
            else:
                out = _run_pipeline_generator(cpu_generator, text, generation_kwargs)
                audio, sample_rate = _extract_audio_and_rate(out, fallback_rate=22050)
            if audio is None:
                return {"success": False, "error": "generation failed: audio output shape unsupported"}
        else:
            return {"success": False, "error": f"generation failed: {exc}"}

    try:
        wav_bytes = _write_wav(audio, sample_rate)
        return {
            "success": True,
            "mimeType": "audio/wav",
            "audioBase64": base64.b64encode(wav_bytes).decode("ascii"),
        }
    except Exception as exc:
        return {"success": False, "error": f"generation failed: {exc}"}


def _warmup_request(req, cache=None):
    global _PSF_HF_TOKEN
    _PSF_HF_TOKEN = str(req.get("hf_token") or "").strip()
    if _PSF_HF_TOKEN:
        os.environ["HF_TOKEN"] = _PSF_HF_TOKEN
        os.environ["HF_HUB_TOKEN"] = _PSF_HF_TOKEN
        os.environ["HUGGINGFACE_HUB_TOKEN"] = _PSF_HF_TOKEN
    model = str(req.get("model") or "facebook/mms-tts-eng").strip()
    device = str(req.get("device") or "cpu").strip().lower()
    pipeline_device, device_error = _resolve_pipeline_device(device)
    if device_error:
        return {"success": False, "error": device_error}
    if _looks_like_chatterbox(model) and str(device).startswith("cuda") and ":" not in str(device):
        try:
            import torch
            count = int(torch.cuda.device_count())
            if tts_runtime._PSF_CHATTERBOX_CUDA_IDX is not None and 0 <= int(tts_runtime._PSF_CHATTERBOX_CUDA_IDX) < count:
                pipeline_device = int(tts_runtime._PSF_CHATTERBOX_CUDA_IDX)
            elif isinstance(pipeline_device, int) and pipeline_device >= 0:
                tts_runtime._PSF_CHATTERBOX_CUDA_IDX = int(pipeline_device)
        except Exception:
            pass

    runtime_device = _resolve_runtime_device_label(device, pipeline_device)
    torch_dtype = _resolve_torch_dtype(req.get("dtype"), pipeline_device)

    generator, build_error, task_name, kind = _build_generator(
        model,
        pipeline_device,
        runtime_device,
        torch_dtype=torch_dtype,
    )
    if build_error:
        return {"success": False, "error": build_error}

    cache_key = (model, str(pipeline_device), str(req.get("dtype") or "auto").lower())
    if cache is not None:
        if kind == "chatterbox":
            _evict_chatterbox_cache_entries(cache, model, keep_key=None)
        cache[cache_key] = {"generator": generator, "task": task_name, "kind": kind}

    # Prime first real inference path so the first user-facing utterance avoids
    # lazy kernel/setup overhead where possible.
    if req.get("prime"):
        try:
            _ = _synthesize_request(
                {
                    "text": str(req.get("prime_text") or "hello"),
                    "model": model,
                    "device": device,
                    "dtype": req.get("dtype"),
                    "speaking_rate": req.get("speaking_rate"),
                    "noise_scale": req.get("noise_scale"),
                    "noise_scale_duration": req.get("noise_scale_duration"),
                    "chatterbox_cfg_weight": req.get("chatterbox_cfg_weight"),
                    "chatterbox_exaggeration": req.get("chatterbox_exaggeration"),
                },
                cache=cache,
            )
        except Exception:
            # Warmup should remain best-effort.
            pass

    return {
        "success": True,
        "warmed": True,
        "model": model,
        "device": str(pipeline_device),
        "runtime": kind,
    }


def _run_single():
    raw = sys.stdin.read()
    req = json.loads(raw or "{}")
    if req.get("prewarm"):
        _emit(_warmup_request(req, cache=None))
    else:
        _emit(_synthesize_request(req, cache=None))


def _run_server():
    cache = {}
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
        except Exception as exc:
            payload = {"success": False, "error": f"invalid request: {exc}"}
            if req_id is not None:
                payload["id"] = req_id
            sys.stdout.write(json.dumps(payload) + "\n")
            sys.stdout.flush()
            continue
        if req.get("prewarm"):
            payload = _warmup_request(req, cache=cache)
        else:
            payload = _synthesize_request(req, cache=cache)
        if req_id is not None:
            payload["id"] = req_id
        sys.stdout.write(json.dumps(payload) + "\n")
        sys.stdout.flush()


def main():
    if "--serve" in sys.argv:
        _run_server()
    else:
        _run_single()


if __name__ == "__main__":
    main()
