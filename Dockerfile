# Dockerfile for NWWS-OI XMPP Monitor
# Use Node.js 18 LTS slim image for smaller footprint
FROM node:18-slim

# Install dependencies required by Puppeteer
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    libxkbcommon0 \
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
