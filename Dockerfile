FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    SCORELYTICS_HOSTED=1 \
    SCORELYTICS_PYTHON=python3 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
        python3 \
        python3-pip \
        tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY requirements-cloud.txt ./
RUN pip3 install --break-system-packages --no-cache-dir --upgrade pip \
    && pip3 install --break-system-packages --no-cache-dir typing-extensions \
    && pip3 install --break-system-packages --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cpu torch torchvision \
    && pip3 install --break-system-packages --no-cache-dir -r requirements-cloud.txt \
    && python3 -c "import easyocr; easyocr.Reader(['en'], gpu=False, download_enabled=True)"

COPY . .

EXPOSE 10000
CMD ["npm", "run", "start:cloud"]
