import importlib.util
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

spec = importlib.util.spec_from_file_location("probe_app", Path(__file__).with_name("probe_app.py"))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def test_credentials_are_redacted(monkeypatch):
    monkeypatch.setenv("HF_TOKEN", "secret-not-with-standard-prefix")
    assert probe.safe_text("value=secret-not-with-standard-prefix hf_otherToken123") == "value=[REDACTED] [REDACTED]"


def test_missing_token_never_becomes_ready(monkeypatch, capsys):
    monkeypatch.delenv("HF_TOKEN", raising=False)
    probe.run_probe()
    assert probe.report["phase"] == "credentials"
    assert not probe.report["probe_ready"]
    with pytest.raises(Exception) as error:
        probe.ready()
    assert error.value.status_code == 503
    assert "Missing HF_TOKEN" not in capsys.readouterr().out


def test_transcription_is_always_disabled():
    with pytest.raises(Exception) as error:
        probe.transcribe()
    assert error.value.status_code == 503


def test_source_is_inspected_not_executed(tmp_path):
    paths = {}
    for name in probe.FILES:
        paths[name] = tmp_path / name
        paths[name].write_bytes(b"placeholder")
    paths["LICENSE"].write_text("NPL-1.1")
    paths["config.json"].write_text('{"blank_id":1024}')
    paths["streaming_inference_example.py"].write_text("raise RuntimeError('NEVER EXECUTE')")
    np.savez(paths["streaming_global_cmvn.npz"], tlog_mean=np.zeros(80), tlog_std=np.ones(80))
    session = SimpleNamespace(get_inputs=lambda: [SimpleNamespace(name=name, shape=[1], type="tensor(float)") for name in probe.INPUTS],
                              get_outputs=lambda: [SimpleNamespace(name=str(i), shape=[1], type="tensor(float)") for i in range(5)])
    result = probe.inspect_files(paths, lambda _: session)
    assert result["access_verified"] and result["graph_loaded"]
    assert "NEVER EXECUTE" in result["reference_source"]
    assert len(result["files"]["model.q8.onnx"]["sha256"]) == 64
