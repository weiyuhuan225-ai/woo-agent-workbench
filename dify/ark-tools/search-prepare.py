import json

def main(arg1: str) -> dict:
    r = json.loads(arg1)
    if r.get("kind") != "search" or r.get("consent") is not True:
        raise ValueError("Search consent and kind required")
    if not r.get("project_id") or not r.get("request_id"):
        raise ValueError("Missing project or request identity")
    prompt = r.get("prompt", "").strip()
    if not 1 <= len(prompt) <= 8000:
        raise ValueError("Search prompt length invalid")
    return {"result": [{"role": "user", "content": [{"type": "input_text", "text": prompt}]}]}
