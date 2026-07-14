# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.18.0
ARG PYTHON_VERSION=3.13.5

FROM node:${NODE_VERSION}-alpine AS web-builder

WORKDIR /app/web

COPY web/package*.json ./
RUN npm ci

COPY web/ ./
RUN npm run build


FROM python:${PYTHON_VERSION}-slim AS backend

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir -r requirements.txt

COPY app.py config.py database.py logger.py main.py ./
COPY core ./core
COPY handler ./handler
COPY middleware ./middleware
COPY model ./model
COPY router ./router
COPY schema ./schema
COPY service ./service
COPY utils ./utils
COPY --from=web-builder /app/web/dist-app ./web/dist-app

EXPOSE 8000

CMD ["python", "main.py"]
