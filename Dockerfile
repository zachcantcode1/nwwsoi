# Dockerfile for NWWS-OI XMPP Monitor
# Use Node.js 18 LTS slim image for smaller footprint
FROM node:18-slim

# Set DEBIAN_FRONTEND to noninteractive to prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Ensure /etc/apt/keyrings directory exists (suggested by some GPG error solutions)
RUN mkdir -p /etc/apt/keyrings

# Attempt to fix GPG issues and install dependencies
# 1. Clean apt lists thoroughly.
# 2. Temporarily allow insecure repositories to fetch initial package lists and install core GPG/CA tools.
#    This is a workaround to bootstrap the keyring installation if the base image keys are problematic.
# 3. Install gnupg, ca-certificates, and debian-archive-keyring.
# 4. Run apt-get update AGAIN, this time it should be secure using the newly installed keyrings.
# 5. Install all other dependencies.
# 6. Clean up apt lists to reduce image size.
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get update -o Acquire::AllowInsecureRepositories=true && \
    apt-get install -y --no-install-recommends \
        gnupg \
        ca-certificates \
        debian-archive-keyring && \
    apt-get update && \
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
 && rm -rf /var/lib/apt/lists/*

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
