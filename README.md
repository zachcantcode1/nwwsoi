# NWWS-OI: NWS XMPP Operational Information Monitor

## Overview

NWWS-OI (National Weather Service Operational Information) is a project designed to monitor the NWS XMPP feed for weather alerts. When new alerts are received, it generates PNG map images visualizing the alert area and associated information.

This system is crucial for applications requiring automated visual representation of weather warnings.

## Architecture

The core of this project is a Node.js application located in the `nwws-xmpp-monitor/` directory. This single service is responsible for:

1.  **Connecting to the NWS XMPP feed:** It listens for incoming weather alert messages.
2.  **Processing alerts:** It parses the alert data.
3.  **Generating map images:** Using Puppeteer (a headless Chrome browser), it renders HTML/CSS templates (`weather_alerts/map_templates/`) with the alert data overlaid on a map and captures a PNG image.

Previously, image generation was handled by a separate Python Flask service, but this has been consolidated into the Node.js application for simplicity and improved performance.

## Prerequisites

*   **Node.js:** (Specify version if known, e.g., v16.x or later). Ensure `npm` is also installed.
*   **Git:** For cloning the repository.

## Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository_url> # Replace <repository_url> with the actual URL
    cd nwwsoi
    ```

2.  **Configure XMPP Credentials:**
    *   The XMPP monitor service requires credentials to connect to the NWS XMPP feed. These are managed via a `.env` file in the `nwws-xmpp-monitor/` directory.
    *   Create a file named `.env` in the `nwws-xmpp-monitor/` directory.
    *   Add the necessary XMPP connection details to this file. See the "Configuration" section below for expected environment variables.
    *   **Important:** Ensure the `.env` file is added to your `.gitignore` to prevent committing sensitive credentials.

3.  **Install Node.js Dependencies:**
    The `start_services.sh` script handles this, but you can also do it manually:
    ```bash
    cd nwws-xmpp-monitor
    npm install
    cd ..
    ```

## Running the Service

The project includes shell scripts to manage the Node.js service. These scripts handle starting, stopping, logging, and PID file management.

**Important:** The scripts (`start_services.sh`, `stop_services.sh`) are currently configured with `PROJECT_ROOT="/root/visualalerts_v2"`. You may need to adjust this path within the scripts if you are running the project in a different root directory, especially in a development environment. For local development, you might run the Node.js application directly.

### Starting the Service

*   To start the XMPP monitoring and image generation service:
    ```bash
    ./start_services.sh
    ```
    This script will:
    *   Install/update Node.js dependencies for the XMPP server (if `npm` is available).
    *   Start the `nwws-xmpp-monitor` service in the background using `nohup`.
    *   Store its PID in `logs/xmpp_server.pid`.
    *   Log its output to `logs/xmpp_server.log`.

### Stopping the Service

*   To stop the service:
    ```bash
    ./stop_services.sh
    ```
    This script will:
    *   Read the PID from `logs/xmpp_server.pid`.
    *   Attempt to gracefully stop the process.
    *   Force kill the process if it doesn't stop gracefully.
    *   Remove the PID file.

### Logs

*   **Service Logs:** Output from the Node.js XMPP monitor service is logged to `$PROJECT_ROOT/logs/xmpp_server.log`.
*   **Script Logs:** The `start_services.sh` and `stop_services.sh` scripts also print status messages to the console.

## Key Directories

*   `nwwsoi/` (Project Root)
    *   `start_services.sh`: Script to start the application.
    *   `stop_services.sh`: Script to stop the application.
    *   `logs/`: Contains runtime logs and PID files.
    *   `nwws-xmpp-monitor/`: Contains the Node.js XMPP monitoring and image generation service.
        *   `src/`: Source code for the service.
            *   `index.js`: Main entry point for the XMPP monitor.
            *   `imageGeneratorService.js`: Handles the image generation logic.
        *   `output/`: Default directory where generated PNG alert images are saved.
        *   `package.json`: Node.js project manifest and dependencies.
    *   `weather_alerts/map_templates/`: Contains HTML (`alert_frame.html`) and CSS (`alert_frame.css`) files used as templates for generating the alert map images.

## Configuration

The `nwws-xmpp-monitor` service is configured using environment variables, typically loaded from a `.env` file located in the `nwws-xmpp-monitor/` directory.

Create a `nwws-xmpp-monitor/.env` file with the following variables:

```ini
# .env example for nwws-xmpp-monitor/
XMPP_JID=your_jid@example.com
XMPP_PASSWORD=your_password
XMPP_HOST=xmpp.example.com
XMPP_PORT=5222
# Add any other necessary environment variables below
# OUTPUT_DIR=./output (This is often configured in the code, but can be an env var)
```

*   `XMPP_JID`: Your full Jabber ID for the XMPP connection.
*   `XMPP_PASSWORD`: The password for your JID.
*   `XMPP_HOST`: The hostname of the XMPP server.
*   `XMPP_PORT`: The port number for the XMPP server (usually 5222).
*   `OUTPUT_DIR` (Optional): You might configure the output directory for generated images via an environment variable. Check `nwws-xmpp-monitor/src/config.js` or similar for how this is handled if not explicitly an environment variable.

Ensure the Node.js application (`nwws-xmpp-monitor/src/index.js` or a dedicated config file) is set up to load these variables using a library like `dotenv`.
