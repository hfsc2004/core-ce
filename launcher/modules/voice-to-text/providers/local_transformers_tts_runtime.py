#!/usr/bin/env python3
# @version 1.1.2 - March 5, 2026
# @copyright 2026 Pseudo SF
import gc

_PSF_CHATTERBOX_CUDA_IDX = None


def _looks_like_chatterbox(model):
    value = str(model or "").strip().lower()
    return "chatterbox" in value


def _looks_like_dia(model):
    value = str(model or "").strip().lower()
    return ("nari-labs/dia" in value) or ("dia-1.6b" in value)


def _safe_number(value, fallback):
    try:
        parsed = float(value)
        if parsed != parsed:
            return fallback
        return parsed
    except Exception:
        return fallback


def _resolve_pipeline_device(device):
    device_value = str(device or "cpu").strip().lower()
    pipeline_device = -1
    if device_value.startswith("cuda"):
        try:
            import torch
        except Exception as exc:
            return (None, f"cuda requested but torch import failed: {exc}")
        if not torch.cuda.is_available():
            return (None, "cuda requested but torch.cuda.is_available() is false")

        explicit_idx = None
        if ":" in device_value:
            try:
                explicit_idx = int(device_value.split(":", 1)[1].strip())
            except Exception:
                explicit_idx = None
        if explicit_idx is not None:
            if explicit_idx < 0 or explicit_idx >= int(torch.cuda.device_count()):
                return (None, f"cuda device index out of range: {explicit_idx}")
            pipeline_device = explicit_idx
        else:
            best_idx = 0
            best_free = -1
            count = int(torch.cuda.device_count())
            for idx in range(count):
                free_bytes = -1
                try:
                    free, _total = torch.cuda.mem_get_info(idx)
                    free_bytes = int(free)
                except Exception:
                    try:
                        with torch.cuda.device(idx):
                            free, _total = torch.cuda.mem_get_info()
                            free_bytes = int(free)
                    except Exception:
                        free_bytes = -1
                if free_bytes > best_free:
                    best_free = free_bytes
                    best_idx = idx
            pipeline_device = best_idx
    elif device_value == "cpu":
        pipeline_device = -1
    elif device_value == "mps":
        pipeline_device = "mps"
    else:
        pipeline_device = device_value
    return (pipeline_device, "")


def _resolve_runtime_device_label(device, pipeline_device):
    requested = str(device or "cpu").strip().lower()
    if requested == "mps":
        return "mps"
    if requested.startswith("cuda"):
        if ":" in requested:
            return requested
        if isinstance(pipeline_device, int) and pipeline_device >= 0:
            return f"cuda:{pipeline_device}"
        if str(pipeline_device).isdigit():
            return f"cuda:{str(pipeline_device)}"
        return "cuda"
    if str(pipeline_device).isdigit():
        return f"cuda:{str(pipeline_device)}"
    return "cpu"


def _resolve_torch_dtype(dtype_value, pipeline_device):
    dtype_raw = str(dtype_value or "auto").strip().lower()
    if dtype_raw == "auto":
        if str(pipeline_device) == "0":
            dtype_raw = "float16"
        else:
            return None
    try:
        import torch
    except Exception:
        return None
    mapping = {
        "float16": torch.float16,
        "float32": torch.float32,
        "bfloat16": torch.bfloat16,
    }
    return mapping.get(dtype_raw)


def _build_pipeline_generator(model, pipeline_device, torch_dtype=None):
    try:
        from transformers import pipeline
    except Exception as exc:
        return (None, f"transformers import failed: {exc}", "", "")

    common_kwargs = {
        "model": model,
        "device": pipeline_device,
        "trust_remote_code": True,
    }
    if torch_dtype is not None:
        common_kwargs["torch_dtype"] = torch_dtype

    try:
        generator = pipeline("text-to-audio", **common_kwargs)
        return (generator, "", "text-to-audio", "pipeline")
    except Exception as first_error:
        try:
            generator = pipeline("text-to-speech", **common_kwargs)
            return (generator, "", "text-to-speech", "pipeline")
        except Exception as second_error:
            return (
                None,
                (
                    f"failed to create local transformers TTS pipeline for {model}; "
                    f"text-to-audio error: {first_error}; text-to-speech error: {second_error}"
                ),
                "",
                "",
            )


def _build_chatterbox_generator(model, runtime_device):
    try:
        import perth
        if not callable(getattr(perth, "PerthImplicitWatermarker", None)):
            class _NoopWatermarker:
                def apply_watermark(self, wav, sample_rate=None):
                    return wav
            perth.PerthImplicitWatermarker = _NoopWatermarker
    except Exception:
        pass

    lowered = str(model or "").strip().lower()
    target_class = None
    import_error = None

    try:
        if "turbo" in lowered:
            from chatterbox.tts_turbo import ChatterboxTurboTTS
            target_class = ChatterboxTurboTTS
        elif "multilingual" in lowered:
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS
            target_class = ChatterboxMultilingualTTS
        else:
            from chatterbox.tts import ChatterboxTTS
            target_class = ChatterboxTTS
    except Exception as exc:
        import_error = exc

    if target_class is None:
        return (
            None,
            f"chatterbox runtime unavailable: {import_error}. Install with: pip install chatterbox-tts",
            "",
            "",
        )

    loader = getattr(target_class, "from_pretrained", None)
    if not callable(loader):
        return (
            None,
            f"chatterbox runtime unavailable: {target_class} does not expose callable from_pretrained()",
            "",
            "",
        )

    attempts = [("from_pretrained", (runtime_device,), {})]
    if runtime_device != "cpu":
        attempts.append(("from_pretrained", ("cpu",), {}))

    errors = []
    for mode, args, kwargs in attempts:
        try:
            if mode == "constructor":
                obj = target_class(*args, **kwargs)
            else:
                obj = loader(*args, **kwargs)
            return (obj, "", "chatterbox", "chatterbox")
        except TypeError as exc:
            errors.append(str(exc))
            continue
        except Exception as exc:
            msg = str(exc)
            errors.append(msg)
            low = msg.lower()
            if runtime_device != "cpu" and ("out of memory" in low or "cuda out of memory" in low):
                try:
                    obj = loader("cpu")
                    return (obj, "", "chatterbox", "chatterbox")
                except Exception as exc2:
                    errors.append(str(exc2))
            continue

    return (
        None,
        f"failed to create chatterbox generator for {model}: {' | '.join(errors[-3:])}",
        "",
        "",
    )


def _build_dia_generator(model, pipeline_device, torch_dtype=None):
    try:
        import torch
        from transformers import AutoProcessor, DiaForConditionalGeneration
    except Exception as exc:
        return (
            None,
            f"dia runtime unavailable: {exc}. Install with: pip install --upgrade \"transformers>=4.53.1\" descript-audio-codec safetensors",
            "",
            "",
        )

    model_kwargs = {
        "trust_remote_code": True,
    }
    if torch_dtype is not None:
        model_kwargs["torch_dtype"] = torch_dtype

    try:
        processor = AutoProcessor.from_pretrained(model, trust_remote_code=True)
        dia_model = DiaForConditionalGeneration.from_pretrained(model, **model_kwargs)
    except Exception as exc:
        return (None, f"failed to load dia model {model}: {exc}", "", "")

    device_label = "cpu"
    if str(pipeline_device) == "mps":
        device_label = "mps"
    elif isinstance(pipeline_device, int) and pipeline_device >= 0:
        device_label = f"cuda:{pipeline_device}"
    elif str(pipeline_device).isdigit():
        idx = int(str(pipeline_device))
        if idx >= 0:
            device_label = f"cuda:{idx}"

    try:
        dia_model = dia_model.to(device_label)
    except Exception as exc:
        return (None, f"failed to place dia model on {device_label}: {exc}", "", "")

    try:
        dia_model.eval()
    except Exception:
        pass

    return (
        {"model": dia_model, "processor": processor, "device": device_label},
        "",
        "dia",
        "dia",
    )


def _build_generator(model, pipeline_device, runtime_device, torch_dtype=None):
    if _looks_like_dia(model):
        return _build_dia_generator(model, pipeline_device, torch_dtype=torch_dtype)
    if _looks_like_chatterbox(model):
        generator, err, task_name, kind = _build_chatterbox_generator(model, runtime_device)
        if not err:
            return (generator, err, task_name, kind)
        return (None, err, "", "")
    return _build_pipeline_generator(model, pipeline_device, torch_dtype=torch_dtype)


def _run_pipeline_generator(generator, text, generation_kwargs):
    if generation_kwargs:
        try:
            return generator(text, **generation_kwargs)
        except TypeError:
            pass
        except Exception as exc:
            err = str(exc).lower()
            if "unexpected keyword" not in err and "got an unexpected keyword" not in err:
                raise
        try:
            return generator(text, forward_params=generation_kwargs)
        except TypeError:
            pass
        except Exception as exc:
            err = str(exc).lower()
            if "unexpected keyword" not in err and "got an unexpected keyword" not in err:
                raise
    return generator(text)


def _run_chatterbox_generator(generator, text, req):
    kwargs = {
        "cfg_weight": _safe_number(req.get("chatterbox_cfg_weight"), 0.5),
        "exaggeration": _safe_number(req.get("chatterbox_exaggeration"), 0.5),
    }
    language_id = str(req.get("language_id") or "").strip()
    if language_id:
        kwargs["language_id"] = language_id
    return generator.generate(text, **kwargs)


def _run_dia_generator(generator, text, req):
    try:
        import torch
    except Exception as exc:
        raise RuntimeError(f"dia runtime unavailable: {exc}")

    dia_model = generator.get("model") if isinstance(generator, dict) else None
    processor = generator.get("processor") if isinstance(generator, dict) else None
    device_label = str(generator.get("device") or "cpu") if isinstance(generator, dict) else "cpu"
    if dia_model is None or processor is None:
        raise RuntimeError("invalid dia generator state")

    inputs = processor(text=[text], padding=True, return_tensors="pt")
    if isinstance(inputs, dict):
        for key, value in list(inputs.items()):
            if hasattr(value, "to"):
                inputs[key] = value.to(device_label)

    max_new_tokens = int(req.get("max_new_tokens") or 3072)
    with torch.no_grad():
        generated = dia_model.generate(**inputs, max_new_tokens=max_new_tokens)
    decoded = processor.batch_decode(generated)
    if not decoded:
        raise RuntimeError("dia returned empty audio output")
    audio = decoded[0]
    if isinstance(audio, list) and audio and isinstance(audio[0], list):
        audio = audio[0]

    sample_rate = (
        int(getattr(processor, "sampling_rate", 0) or 0)
        or int(getattr(processor, "sample_rate", 0) or 0)
        or 44100
    )
    return audio, sample_rate


def _normalize_audio_list(audio):
    if audio is None:
        return None
    if hasattr(audio, "detach"):
        audio = audio.detach().cpu().float().numpy()
    if hasattr(audio, "cpu") and hasattr(audio, "numpy"):
        audio = audio.cpu().numpy()
    if hasattr(audio, "numpy"):
        audio = audio.numpy()
    if hasattr(audio, "tolist"):
        audio = audio.tolist()

    if isinstance(audio, list):
        if len(audio) == 0:
            return []
        if isinstance(audio[0], list):
            first = audio[0]
            if len(first) > 0 and isinstance(first[0], list):
                return first[0]
            return first
        return audio

    return None


def _extract_audio_and_rate(output, fallback_rate=22050):
    out = output
    if isinstance(out, list):
        out = out[0] if out else {}

    sample_rate = int(fallback_rate)
    audio = None

    if isinstance(out, dict):
        audio = out.get("audio")
        sample_rate = int(out.get("sampling_rate", fallback_rate))
    elif isinstance(out, tuple) and len(out) >= 1:
        audio = out[0]
        if len(out) > 1:
            try:
                sample_rate = int(out[1])
            except Exception:
                sample_rate = int(fallback_rate)
    else:
        audio = out

    audio_list = _normalize_audio_list(audio)
    return audio_list, sample_rate


def _evict_chatterbox_cache_entries(cache, model, keep_key=None):
    if cache is None:
        return
    model_key = str(model or "").strip().lower()
    if not model_key:
        return
    remove_keys = []
    for key in list(cache.keys()):
        try:
            key_model = str(key[0] if isinstance(key, tuple) and len(key) > 0 else "").strip().lower()
        except Exception:
            key_model = ""
        if key_model != model_key:
            continue
        if keep_key is not None and key == keep_key:
            continue
        remove_keys.append(key)
    for key in remove_keys:
        try:
            cache.pop(key, None)
        except Exception:
            pass
    if remove_keys:
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
        gc.collect()
