"""Evaluate manually verified Quran ASR observations. Standard library only.

Input JSON array: [{"id":"clip-1","reference":"...","hypothesis":"...",
"latency_ms":450,"ground_truth_error":false,"alerted":false,
"transcript_format":"words"}]
Only word-format hypotheses are eligible for lexical WER. Phoneme-format
transcripts are deliberately excluded because phonemes are not Arabic words.
"""
import argparse
import json
from pathlib import Path

def words(text):
    return str(text).split()

def distance(a,b):
    previous=list(range(len(b)+1))
    for i,x in enumerate(a,1):
        current=[i]
        for j,y in enumerate(b,1):
            current.append(min(current[-1]+1,previous[j]+1,previous[j-1]+(x!=y)))
        previous=current
    return previous[-1]

def evaluate(entries):
    report={"total":len(entries),"word_evaluable":0,"phoneme_excluded":0,
            "total_reference_words":0,"word_edits":0,
            "false_alerts":0,"missed_errors":0,"true_alerts":0,
            "correct_no_alert":0,"latencies_ms":[]}
    for entry in entries:
        if entry.get("transcript_format")=="words":
            ref=words(entry.get("reference",""))
            hyp=words(entry.get("hypothesis",""))
            if ref:
                report["word_evaluable"]+=1
                report["total_reference_words"]+=len(ref)
                report["word_edits"]+=distance(ref,hyp)
        else:
            report["phoneme_excluded"]+=1
        truth=entry.get("ground_truth_error")
        alert=entry.get("alerted")
        if type(truth) is bool and type(alert) is bool:
            key=("true_alerts" if alert else "missed_errors") if truth else ("false_alerts" if alert else "correct_no_alert")
            report[key]+=1
        latency=entry.get("latency_ms")
        if type(latency) in (int,float) and latency>=0:
            report["latencies_ms"].append(latency)
    total=report["total_reference_words"]
    report["wer"]=report["word_edits"]/total if total else None
    lat=sorted(report.pop("latencies_ms"))
    report["latency_count"]=len(lat)
    report["latency_median_ms"]=lat[(len(lat)-1)//2] if lat else None
    return report

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("observations",type=Path)
    args=parser.parse_args()
    print(json.dumps(evaluate(json.loads(args.observations.read_text(encoding="utf-8"))),ensure_ascii=False,indent=2))
