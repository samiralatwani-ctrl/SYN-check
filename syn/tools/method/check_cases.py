#!/usr/bin/env python3
"""Reference evaluator for method/v1: checks that cases.yaml is consistent with rules.yaml and that the
label-extraction schema is valid. Temporary oracle until packages/rules-engine (TypeScript) exists; the TS engine
must pass the same cases."""
import sys, yaml, json, jsonschema
root=sys.argv[1] if len(sys.argv) > 1 else __import__("os").path.join(__import__("os").path.dirname(__file__), "..", "..")
R=yaml.safe_load(open(f"{root}/method/v1/rules.yaml"))
C=yaml.safe_load(open(f"{root}/method/v1/cases.yaml"))["cases"]
jsonschema.Draft202012Validator.check_schema(json.load(open(f"{root}/packages/schemas/label-extraction.schema.json")))
T=R["thresholds"]; S=R["signals"]
def sev(sig):
    t=sig["type"]; d=S[t]; s=sig.get("severity_override", d["severity"])
    if s=="by_rule":
        if t=="alert_batch":
            a=sig["alert"]
            if a["alert_kind"]=="fake_batch" or a["dates_equal"]=="counterfeit" or (a["dates_equal"]=="neither" and a["dates_readable"]): s="critical"
            else: s="major"
        else:
            i=sig["ingredients"]
            if i.get("active_changed"): s="critical"
            elif i.get("matches_older_formula_version"): s="minor"
            elif i.get("non_active_diff_count",0)<=T["ingredients_minor_max_diff"]: s="minor"
            else: s="major"
    if d.get("experimental") and s in("critical","major"): s="minor"
    return s
def evaluate(c):
    ctx=c["context"]; ref=ctx["reference_status"]; sigs=[]
    for g in c["signals"]:
        g={"outcome":"match","confidence":1.0,"source":"db","user_confirmed":False,**g}
        assert g["type"] in S, g["type"]
        if g["confidence"]<T["min_confidence"]: g["outcome"]="unavailable"
        if S[g["type"]]["needs_verified_ref"] and ref!="verified": continue
        g["sev"]=sev(g) if g["outcome"]=="mismatch" else None
        sigs.append(g)
    crit=[g for g in sigs if g["sev"]=="critical"]
    if crit:
        if all(g["source"]=="ocr" and not g["user_confirmed"] for g in crit): return "suspect","S1_critical"
        return "mismatch","S1_critical"
    if ref!="verified": return "insufficient","S2_no_reference"
    if len(c["readable"])<T["min_readable_fields"]: return "insufficient","S3_too_little_read"
    if any(g["sev"]=="major" for g in sigs): return "suspect","S4_major"
    if any(g["sev"]=="minor" for g in sigs): return "minor","S5_minor"
    req=R["required_for_match"][ctx["regulatory_class"]]
    ok={g["type"] for g in sigs if g["outcome"]=="match"}
    if all(r in ok for r in req): return "match","S6_match"
    return "insufficient","S7_default"
bad=0
for c in C:
    v,st=evaluate(c); e=c["expect"]
    if (v,st)!=(e["verdict"],e["step"]): bad+=1; print("FAIL",c["id"],v,st,"expected",e)
print(f"{len(C)-bad}/{len(C)} cases consistent; schema valid")
sys.exit(1 if bad else 0)
