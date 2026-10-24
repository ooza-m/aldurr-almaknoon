"""Local Quran audio evaluation runner; requires explicit non-production URL.

Only use recordings you are authorized to upload. WAV must be mono PCM16 16 kHz.
A transcript, especially phonemes, is not a verified recitation error.
"""
import argparse
import base64
import json
import time
import urllib.parse
import urllib.request
import wave
from pathlib import Path
from evaluate_recordings import evaluate

PRODUCTION_HOSTS={"quran-asr-production-3419.up.railway.app"}
def validate_endpoint(url):
    parsed=urllib.parse.urlparse(url)
    if parsed.scheme not in {"http","https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Invalid test endpoint")
    if parsed.hostname in PRODUCTION_HOSTS or "production" in parsed.hostname.lower():
        raise ValueError("Production endpoint is forbidden")
    if parsed.scheme != "https" and parsed.hostname not in {"localhost","127.0.0.1"}:
        raise ValueError("Remote test endpoints must use HTTPS")
    if parsed.query or parsed.fragment or parsed.path not in {"","/"}:
        raise ValueError("Supply the test server origin, not a custom path")
    return url.rstrip("/")

def read_audio(path):
    with wave.open(str(path),"rb") as wav:
        if wav.getnchannels()!=1 or wav.getsampwidth()!=2 or wav.getframerate()!=16000 or wav.getcomptype()!="NONE":
            raise ValueError("Requires mono PCM16 WAV at 16000 Hz")
        if wav.getnframes()>16000*5:
            raise ValueError("Maximum clip length is 5 seconds")
        return wav.readframes(wav.getnframes())

def run(plan_dir,endpoint,timeout=12):
    endpoint=validate_endpoint(endpoint)
    plan=json.loads((plan_dir/"surah_insan_recording_plan.json").read_text(encoding="utf-8"))
    results=[]
    for case in plan["cases"]:
        name=case["id"]
        clip=plan_dir/"recordings"/(name+".wav")
        if not clip.is_file():
            results.append({"id":name,"status":"missing_recording"})
            continue
        audio=read_audio(clip)
        request=urllib.request.Request(endpoint+"/review-audio",data=json.dumps({
            "audio_b64":base64.b64encode(audio).decode("ascii"),"sample_rate":16000,"final":True
        }).encode("utf-8"),headers={"Content-Type":"application/json"},method="POST")
        started=time.monotonic()
        try:
            with urllib.request.urlopen(request,timeout=timeout) as response:
                payload=json.loads(response.read(1048576))
            results.append({"id":name,"status":"transcribed","reference":case.get("reference",""),
              "hypothesis":payload.get("transcript",""),"transcript_format":payload.get("transcript_format"),
              "latency_ms":round((time.monotonic()-started)*1000,1),
              "ground_truth_error":case["expected_error"]})
        except Exception as err:
            results.append({"id":name,"status":"request_failed","error":type(err).__name__})
    return {"summary":evaluate([r for r in results if r.get("status")=="transcribed"]),"cases":results,
            "warning":"Transcript is unverified; no automatic error alert metrics without manual labels."}

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--fixtures",type=Path,default=Path(__file__).parent/"fixtures")
    parser.add_argument("--test-url",required=True)
    parser.add_argument("--out",type=Path,default=Path("quran-evaluation-report.json"))
    args=parser.parse_args()
    report=run(args.fixtures,args.test_url)
    args.out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print("Report:",args.out)
