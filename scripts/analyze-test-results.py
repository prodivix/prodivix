import json
import sys

raw = sys.stdin.read()
start = raw.find('{"numTotalTestSuites')
# vitest may emit additional non-JSON content after the JSON document; decode just the first object
js, _ = json.JSONDecoder().raw_decode(raw[start:])

mode = sys.argv[1] if len(sys.argv) > 1 else "summary"

for r in js.get("testResults", []):
    name = r.get("name", "")
    short = name.replace("\\", "/")
    if "prodivix/" in short:
        short = short.split("prodivix/", 1)[1]
    failed_titles = [
        a.get("fullName") or a.get("title")
        for a in r.get("assertionResults", [])
        if a.get("status") == "failed"
    ]
    passed = sum(1 for a in r.get("assertionResults", []) if a.get("status") == "passed")
    failed = len(failed_titles)
    if failed == 0:
        continue
    if mode == "summary":
        print(f"{failed:3d}F {passed:3d}P  {short}")
    else:
        print(short)
        for title in failed_titles:
            print(f"    {title}")
