# Dockerfile for NWWS-OI XMPP Monitor
# Use official Puppeteer Docker image for guaranteed compatibility

# Use the official Puppeteer Docker image
FROM ghcr.io/puppeteer/puppeteer:21.4.0

# Set working directory
WORKDIR /usr/src/app

# Configure Puppeteer to use existing Chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

# Create cache directory with proper permissions
RUN mkdir -p /home/pptruser/.cache/puppeteer \
    && chown -R pptruser:pptruser /home/pptruser/.cache

# Create app directory structure
RUN mkdir -p node_modules output logs \
    && chown -R pptruser:pptruser /usr/src/app

# Install application dependencies
COPY nwws-xmpp-monitor/package*.json ./
RUN npm ci --only=production

# Copy application code
COPY nwws-xmpp-monitor/ ./

# Set environment for production
ENV NODE_ENV=production

# Add cleanup
RUN apt-get clean autoclean \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /var/lib/{apt,dpkg,cache,log}/

# Switch to non-root user
USER pptruser

# Change to the src directory
WORKDIR /usr/src/app/src

# Run the application
CMD [ "node", "index.js" ]
