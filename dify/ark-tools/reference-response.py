import json
from urllib.parse import urlparse


def main(arg1: str, arg2: int):
    if int(arg2) != 200:
        raise ValueError("ARK_REFERENCE_HTTP_FAILED:" + str(arg2))
    obj = json.loads(arg1)
    if obj.get("error"):
        raise ValueError("ARK_REFERENCE_PROVIDER_ERROR")
    data = obj.get("data")
    if not isinstance(data, list) or not data:
        raise ValueError("ARK_REFERENCE_EMPTY_IMAGE")
    clean = []
    for item in data:
        url = item.get("url", "")
        if urlparse(url).scheme != "https" or not urlparse(url).hostname:
            raise ValueError("ARK_REFERENCE_INVALID_URL")
        clean.append({"url": url})
    return {"result": [{"model": obj.get("model", "doubao-seedream-5-0-pro-260628"), "data": clean}]}
