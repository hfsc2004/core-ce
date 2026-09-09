#!/usr/bin/env python3
"""RLM Python worker.

Runs one validated snippet against a bounded prompt/scratch environment and
returns JSON. This worker is launched as a short-lived subprocess by Node.
"""

import ast
import json
import math
import sys
import traceback


class _SubLmNeeded(Exception):
    pass


def _clamp_int(value, fallback, minimum, maximum):
    try:
        number = int(value)
    except Exception:
        return fallback
    return max(minimum, min(maximum, number))


def _preview(text, limit=240):
    value = str(text or "")
    if len(value) <= limit:
        return value
    return value[:limit] + "..."


def _validate_ast(code):
    errors = []
    try:
        tree = ast.parse(code, mode="exec")
    except SyntaxError as err:
        return [{"id": "syntax", "message": str(err)}]

    banned_nodes = (
        ast.Import,
        ast.ImportFrom,
        ast.Global,
        ast.Nonlocal,
        ast.AsyncFunctionDef,
        ast.Await,
        ast.ClassDef,
        ast.FunctionDef,
        ast.Lambda,
        ast.With,
        ast.AsyncWith,
    )
    banned_calls = {
        "eval",
        "exec",
        "compile",
        "open",
        "input",
        "breakpoint",
        "globals",
        "locals",
        "vars",
        "dir",
        "getattr",
        "setattr",
        "delattr",
        "__import__",
    }

    for node in ast.walk(tree):
        if isinstance(node, banned_nodes):
            errors.append({"id": "ast-blocked-node", "message": f"{type(node).__name__} is disabled."})
        if isinstance(node, ast.Attribute) and str(node.attr).startswith("__"):
            errors.append({"id": "ast-dunder", "message": "Dunder attribute access is disabled."})
        if isinstance(node, ast.Name) and str(node.id).startswith("__"):
            errors.append({"id": "ast-dunder", "message": "Dunder names are disabled."})
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in banned_calls:
            errors.append({"id": f"ast-call-{node.func.id}", "message": f"{node.func.id}() is disabled."})
    return errors


def _build_safe_builtins():
    return {
        "abs": abs,
        "all": all,
        "any": any,
        "bool": bool,
        "dict": dict,
        "enumerate": enumerate,
        "filter": filter,
        "float": float,
        "int": int,
        "len": len,
        "list": list,
        "map": map,
        "max": max,
        "min": min,
        "range": range,
        "reversed": reversed,
        "round": round,
        "set": set,
        "sorted": sorted,
        "str": str,
        "sum": sum,
        "tuple": tuple,
        "zip": zip,
    }


def _apply_resource_limits(policy):
    if sys.platform.startswith("win"):
        return []
    applied = []
    try:
        import resource
    except Exception:
        return applied

    cpu_seconds = max(1, int(math.ceil(_clamp_int(policy.get("maxExecMs"), 5000, 250, 120000) / 1000)))
    memory_bytes = _clamp_int(policy.get("maxMemoryBytes"), 128 * 1024 * 1024, 16 * 1024 * 1024, 2 * 1024 * 1024 * 1024)
    limits = [
        ("RLIMIT_CPU", resource.RLIMIT_CPU, cpu_seconds, cpu_seconds + 1),
        ("RLIMIT_AS", resource.RLIMIT_AS, memory_bytes, memory_bytes),
        ("RLIMIT_FSIZE", resource.RLIMIT_FSIZE, 1024 * 1024, 1024 * 1024),
        ("RLIMIT_NOFILE", resource.RLIMIT_NOFILE, 16, 16),
    ]
    if hasattr(resource, "RLIMIT_NPROC"):
        limits.append(("RLIMIT_NPROC", resource.RLIMIT_NPROC, 0, 0))

    for name, target, soft, hard in limits:
        try:
            current_soft, current_hard = resource.getrlimit(target)
            next_hard = hard if current_hard < 0 else min(current_hard, hard)
            next_soft = min(soft, next_hard)
            resource.setrlimit(target, (next_soft, next_hard))
            applied.append(name)
        except Exception:
            continue
    return applied


def _run(payload):
    code = str(payload.get("code") or "")
    prompt = str(payload.get("prompt") or "")
    scratch = dict(payload.get("scratch") or {})
    sub_lm_cache = dict(payload.get("sub_lm_cache") or {})
    sub_lm_requests = []
    policy = dict(payload.get("policy") or {})
    max_slice_chars = _clamp_int(policy.get("maxPromptSliceChars"), 12000, 512, 200000)
    max_final_chars = _clamp_int(policy.get("maxFinalOutputChars"), 24000, 512, 1000000)
    max_stdout_chars = _clamp_int(policy.get("maxStdoutChars"), 4000, 256, 100000)
    resource_limits = _apply_resource_limits(policy)
    captured_stdout = []
    captured_stdout_chars = 0
    final = {"set": False, "value": ""}

    errors = _validate_ast(code)
    if errors:
        return {
            "success": False,
            "error": "RLM worker AST validation failed.",
            "errors": errors,
            "scratch": scratch,
            "final": final,
        }

    def safe_print(*args, sep=" ", end="\n"):
        nonlocal captured_stdout_chars
        text = sep.join(str(item) for item in args) + str(end)
        remaining = max_stdout_chars - captured_stdout_chars
        if remaining <= 0:
            return
        captured_stdout.append(text[:remaining])
        captured_stdout_chars += min(len(text), remaining)

    def len_prompt():
        return len(prompt)

    def slice_prompt(start=0, end=0):
        s = _clamp_int(start, 0, 0, len(prompt))
        e = len(prompt) if end is None or int(end or 0) <= 0 else _clamp_int(end, len(prompt), s, len(prompt))
        text = prompt[s:e]
        return text[:max_slice_chars]

    def search_prompt(pattern, max_hits=20):
        query = str(pattern or "")
        if not query:
            return []
        limit = _clamp_int(max_hits, 20, 1, 200)
        lower_prompt = prompt.lower()
        lower_query = query.lower()
        hits = []
        index = 0
        while len(hits) < limit:
            found = lower_prompt.find(lower_query, index)
            if found < 0:
                break
            hits.append({
                "index": found,
                "preview": _preview(prompt[max(0, found - 80):min(len(prompt), found + len(query) + 80)], 220),
            })
            index = found + max(1, len(query))
        return hits

    def chunk_prompt(chunk_size=4000, overlap=200):
        size = _clamp_int(chunk_size, 4000, 128, 100000)
        ov = _clamp_int(overlap, 200, 0, max(0, size - 1))
        chunks = []
        start = 0
        while start < len(prompt):
            end = min(len(prompt), start + size)
            chunks.append({"index": len(chunks), "start": start, "end": end, "text": prompt[start:end]})
            if end >= len(prompt):
                break
            start = max(start + 1, end - ov)
        return chunks

    def sub_lm(request_prompt, max_tokens=None, model=None, temperature=None):
        prompt_value = str(request_prompt or "").strip()
        if not prompt_value:
            raise ValueError("sub_lm prompt is required.")
        request = {
            "prompt": prompt_value,
            "max_tokens": _clamp_int(max_tokens, 1024, 64, 32768) if max_tokens is not None else None,
            "model": str(model or "").strip(),
            "temperature": temperature,
        }
        key = json.dumps(request, sort_keys=True, ensure_ascii=True)
        if key in sub_lm_cache:
            return str(sub_lm_cache.get(key) or "")
        sub_lm_requests.append({**request, "key": key})
        raise _SubLmNeeded("RLM sub_lm request requires host model transport.")

    def set_value(name, value):
        key = str(name or "").strip()
        if not key:
            raise ValueError("Environment value name is required.")
        scratch[key] = str(value or "")
        return {"name": key, "chars": len(scratch[key])}

    def get_value(name, offset=0, length=0):
        key = str(name or "").strip()
        value = str(scratch.get(key, ""))
        start = _clamp_int(offset, 0, 0, len(value))
        size = _clamp_int(length, 0, 0, len(value))
        end = min(len(value), start + size) if size > 0 else len(value)
        return value[start:end]

    def list_values():
        return sorted(scratch.keys())

    def set_final(value):
        final["value"] = str(value or "")[:max_final_chars]
        final["set"] = True
        return {"chars": len(final["value"])}

    safe_globals = {
        "__builtins__": {
            **_build_safe_builtins(),
            "print": safe_print,
        },
        "len_prompt": len_prompt,
        "slice_prompt": slice_prompt,
        "search_prompt": search_prompt,
        "chunk_prompt": chunk_prompt,
        "sub_lm": sub_lm,
        "set_value": set_value,
        "get_value": get_value,
        "list_values": list_values,
        "set_final": set_final,
    }
    safe_locals = {}
    try:
        exec(compile(code, "<rlm-repl>", "exec"), safe_globals, safe_locals)
    except _SubLmNeeded as err:
        return {
            "success": False,
            "needs_sub_lm": True,
            "error": str(err),
            "sub_lm_requests": sub_lm_requests,
            "scratch": scratch,
            "final": final,
            "stdout": "".join(captured_stdout),
            "resource_limits": resource_limits,
        }
    except Exception as err:
        return {
            "success": False,
            "error": str(err),
            "traceback": traceback.format_exc(limit=4),
            "scratch": scratch,
            "final": final,
            "stdout": "".join(captured_stdout),
            "resource_limits": resource_limits,
        }

    return {
        "success": True,
        "scratch": scratch,
        "final": final,
        "stdout": "".join(captured_stdout),
        "resource_limits": resource_limits,
    }


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        result = _run(payload)
    except Exception as err:
        result = {
            "success": False,
            "error": str(err),
            "traceback": traceback.format_exc(limit=4),
        }
    sys.stdout.write(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
