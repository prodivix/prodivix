import json
import sys

raw = sys.stdin.read()
start = raw.find('{"numTotalTestSuites')
js, _ = json.JSONDecoder().raw_decode(raw[start:])

for r in js.get("testResults", []):
    name = r.get("name", "").replace("\\", "/")
    short = name.split("prodivix/", 1)[-1]
    for a in r.get("assertionResults", []):
        if a.get("status") != "failed":
            continue
        messages = a.get("failureMessages", [])
        if not messages:
            continue
        first_line = messages[0].split("\n")[0][:200]
        print(f"{short}")
        print(f"  TEST: {a.get('fullName', a.get('title', ''))[:100]}")
        print(f"  ERR : {first_line}")
        print()
