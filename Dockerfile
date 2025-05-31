# Dockerfile for NWWS-OI XMPP Monitor
# Use Node.js 18 LTS bullseye slim image for smaller footprint

# Builder stage
FROM node:18-bullseye-slim AS builder

# Install dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        gnupg \
        debian-archive-keyring \
        libasound2 \
        libatk1.0-0 \
        libatk-bridge-2.0-0 \
        libcairo2 \
        libgbm1 \
        libglib2.0-0 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
        libx11-6 \
        libxcb1 \
        libxcomposite1 \
        libxcursor1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxi6 \
        libxkbcommon0 \
        libxrandr2 \
        libxrender1 \
        libxss1 \
        libxtst6 \
        fonts-liberation \
        libcups2 \
        libdbus-1-3 \
        libexpat1 \
        libfontconfig1 \
        libgdk-pixbuf2.0-0 \
        libpangocairo-1.0-0 \
        lsb-release \
        xdg-utils \
    && apt-get clean

WORKDIR /usr/src/app
COPY nwws-xmpp-monitor/package*.json ./
RUN npm ci --only=production
COPY nwws-xmpp-monitor/ ./

# Create directories for generated images and logs
RUN mkdir -p output logs

# Set environment for production
ENV NODE_ENV=production

# Final image
FROM node:18-bullseye-slim
COPY --from=builder /usr/src/app /usr/src/app
WORKDIR /usr/src/app

# Default command to start the XMPP monitor service
CMD ["npm", "start"]
