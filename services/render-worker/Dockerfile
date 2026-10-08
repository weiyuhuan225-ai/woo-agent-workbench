FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server.py font-codepoints.json ./
RUN useradd --system --uid 10001 renderer && mkdir /data && chown renderer /data
USER renderer
EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["python", "server.py", "--data-dir", "/data", "--host", "0.0.0.0", "--port", "8080"]
