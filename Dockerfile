# Dockerfile for NWWS-OI XMPP Monitor
# Use official Puppeteer Docker image for guaranteed compatibility

# Use the official Puppeteer Docker image
FROM ghcr.io/puppeteer/puppeteer:21.4.0

# Set working directory
WORKDIR /usr/src/app

# Install application dependencies
COPY nwws-xmpp-monitor/package*.json ./
RUN npm ci --only=production

# Copy application code
COPY nwws-xmpp-monitor/ ./

# Create directories for generated images and logs
RUN mkdir -p output logs

# Set environment for production
ENV NODE_ENV=production

# Add cleanup
RUN apt-get clean autoclean \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /var/lib/{apt,dpkg,cache,log}/

# Run as non-root user
RUN chown -R pptruser:pptruser /usr/src/app
USER pptruser

# Change to the src directory
WORKDIR /usr/src/app/src

# Run the application
CMD [ "node", "index.js" ]
