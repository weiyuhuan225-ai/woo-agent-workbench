import json

def main(body: str, status_code: int) -> dict:
    if status_code != 200:
        raise ValueError("Vision provider HTTP " + str(status_code) + "; check original run, do not resubmit")
    data = json.loads(body)
    choices = data.get("choices", [])
    if len(choices) != 1 or choices[0].get("finish_reason") != "stop":
        raise ValueError("Vision response incomplete")
    text = choices[0].get("message", {}).get("content")
    if data.get("model") != "doubao-seed-2-1-pro-260628" or not isinstance(text, str) or not 1 <= len(text.strip()) <= 3000 or not isinstance(data.get("id"), str) or not data["id"]:
        raise ValueError("Invalid vision observation")
    return {"result":[{"text":text.strip(), "model":data["model"], "response_id":data["id"], "usage":data.get("usage",{})}]}
