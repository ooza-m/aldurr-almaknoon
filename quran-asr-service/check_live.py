#!/usr/bin/env python3
"""Read-only Quran ASR endpoint contract probe. Standard library only.
Usage: python quran-asr-service/check_live.py [base-url]
Checks do not send real recitation audio, download models or create sessions.
"""
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT = "https://quran-asr-production-3419.up.railway.app"
BASE = (sys.argv[1] if len(sys.argv)>1 else os.getenv("QASR_URL", DEFAULT)).rstrip("/")
if not BASE.startswith("https://") and not BASE.startswith("http://localhost"):
    raise SystemExit("Refusing non-HTTPS external endpoint")

def get(path):
    req = urllib.request.Request(BASE + path, headers={"Accept":"application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as e:
        try: body=json.load(e)
        except Exception: body={}
        return e.code, body

def main():
    results=[]
    for endpoint in ("/health", "/model-info", "/ready"):
        try: status, body=get(endpoint)
        except Exception as exc:
            results.append({"endpoint":endpoint,"status":"connection-error","reason":type(exc).__name__})
            continue
        record={"endpoint":endpoint,"http_status":status}
        if endpoint=="/health":
            record["engine_loaded"]=body.get("engine_loaded")
            record["model"]=body.get("model")
            record["backend"]=body.get("backend")
            record["passed"]=status==200 and body.get("ok") is True and bool(body.get("quran_specialized"))
        elif endpoint=="/model-info":
            record["engine_loaded"]=body.get("engine_loaded")
            record["transcript_backend"]=body.get("backend")
            record["passed"]=status==200 and bool(body.get("model"))
        else:
            record["passed"]=status==200 and body.get("engine_loaded") is True
            if status!=200: record["reason"]="Model not ready; HTTP success from /health alone is insufficient"
        results.append(record)
    print(json.dumps({"service":BASE,"tests":results,"note":"Read-only contract check; accuracy, error detection and cost require separate verification."},ensure_ascii=False,indent=2))
    return 0 if len(results)==3 and all(x.get("passed") for x in results) else 1

if __name__=="__main__":
    sys.exit(main())
