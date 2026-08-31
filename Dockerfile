FROM node:22-bookworm-slim AS base

ENV CHROME_BIN="/usr/local/bin/chromium-safe" \
    PUPPETEER_EXECUTABLE_PATH="/usr/local/bin/chromium-safe" \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true" \
    NODE_ENV="production" \
    HOME="/home/node"

WORKDIR /usr/src/app

FROM base AS deps

ARG USE_EDGE=false

COPY package*.json ./

RUN if [ "$USE_EDGE" = "true" ]; then \
      apt-get update && apt-get install -y --no-install-recommends git ca-certificates && \
      npm ci --omit=dev --ignore-scripts && \
      npm install --save-exact git+https://github.com/pedroslopez/whatsapp-web.js.git#main && \
      apt-get purge -y git ca-certificates && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*; \
    else \
      npm ci --omit=dev --ignore-scripts; \
    fi

FROM base

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    fonts-freefont-ttf \
    chromium \
    ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY docker/chromium-wrapper.js /usr/local/bin/chromium-safe
RUN chmod 0755 /usr/local/bin/chromium-safe

COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=deps /usr/src/app/package*.json ./

COPY --chown=node:node server.js ./
COPY --chown=node:node LICENSE ./
COPY --chown=node:node swagger.json ./
COPY --chown=node:node src/ ./src/
COPY --chown=node:node public/ ./public/

RUN mkdir -p /usr/src/app/sessions && chown -R node:node /usr/src/app/sessions

USER node

EXPOSE 3000

CMD ["npm", "start"]
