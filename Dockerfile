FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TADS_DATA_ROOT=/data
WORKDIR /app
COPY requirements.lock pyproject.toml ./
COPY services ./services
RUN python -m pip install --no-cache-dir -r requirements.lock && python -m pip install --no-cache-dir --no-deps -e .
COPY fixtures ./fixtures
COPY scripts/serve.py ./scripts/serve.py
RUN useradd --uid 10001 --create-home app && mkdir /data && chown app:app /data
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','8000')+'/health', timeout=3)"
CMD ["python", "scripts/serve.py"]
