# Use official slim Python base image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies for geospatial libraries and Chromium for Selenium
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    build-essential \
    gdal-bin libgdal-dev \
    libgeos-dev libproj-dev \
    python3-dev \
    chromium \
    chromium-driver \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . /app

# Create data and output directories
RUN mkdir -p /app/data /app/output

# Use Chromium for Selenium
ENV CHROME_BIN=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium

# Default command to run scheduler
ENTRYPOINT ["python", "automation.py"]
CMD ["--output", "output"]
