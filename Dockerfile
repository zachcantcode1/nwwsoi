# Dockerfile for NWWS-OI XMPP Monitor
# Use Node.js 18 LTS bullseye slim image for smaller footprint
FROM node:18-bullseye-slim

# Set DEBIAN_FRONTEND to noninteractive to prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Set the working directory in the container
WORKDIR /usr/src/app

# Install minimal dependencies first to avoid disk space issues
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    apt-get clean

# Install remaining dependencies in smaller chunks
RUN apt-get update && \
    apt-get install -y --no-install-recommends gnupg && \
    apt-get clean

RUN apt-get update && \
    apt-get install -y --no-install-recommends debian-archive-keyring && \
    apt-get clean

# Install Puppeteer dependencies in smaller groups
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libasound2 \
        libatk1.0-0 \
        libcairo2 \
        libgbm1 \
        libglib2.0-0 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
    && apt-get clean

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
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
    && apt-get clean

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
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

# Copy package.json and package-lock.json (if available)
COPY nwws-xmpp-monitor/package*.json ./

# Install app dependencies
RUN npm ci --only=production

# Copy the rest of the application code from nwws-xmpp-monitor
COPY nwws-xmpp-monitor/ ./

# Create directories for generated images and logs
RUN mkdir -p output logs

# Set environment for production
ENV NODE_ENV=production

# Default command to start the XMPP monitor service
CMD ["npm", "start"]
