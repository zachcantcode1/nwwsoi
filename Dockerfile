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

# Run the application
CMD [ "node", "app.js" ]
