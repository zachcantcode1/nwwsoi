# Dockerfile for NWWS-OI XMPP Monitor
# Use Node.js 18 LTS slim image for smaller footprint
FROM node:18-slim

# Set DEBIAN_FRONTEND to noninteractive to prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Ensure /etc/apt/keyrings directory exists (suggested by some GPG error solutions)
RUN mkdir -p /etc/apt/keyrings

# Layer 1: Clean, initial insecure update, reinstall keyrings, install gnupg, and clean again.
# This aims to fix GPG key issues and manage disk space before further installations.
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/* && \
    apt-get update -o Acquire::AllowInsecureRepositories=true && \
    apt-get install -y --no-install-recommends gnupg ca-certificates && \
    apt-get install -y --no-install-recommends --reinstall debian-archive-keyring && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Layer 2: Secure update and install all dependencies, then clean.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
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
    lsb-release \
    xdg-utils \
 && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Create and set working directory
WORKDIR /usr/src/app

# Copy package manifest files and install production dependencies
COPY nwws-xmpp-monitor/package*.json ./
RUN npm ci --only=production

# Copy source code into container
COPY nwws-xmpp-monitor/ .

# Create directories for generated images and logs
RUN mkdir -p output logs

# Set environment for production
ENV NODE_ENV=production

# Default command to start the XMPP monitor service
CMD ["npm", "start"]
