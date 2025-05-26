#!/bin/bash

# Define project root and service directories
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
XMPP_DIR="$PROJECT_ROOT/nwws-xmpp-monitor"
LOG_DIR="$PROJECT_ROOT/logs"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Define log file paths
XMPP_LOG="$LOG_DIR/xmpp_server.log"

# Define PID file paths
XMPP_PID_FILE="$LOG_DIR/xmpp_server.pid"

echo "Starting XMPP service..."
echo "Project Root: $PROJECT_ROOT"

# --- Start XMPP Server (Node.js) ---
echo "Attempting to start XMPP server..."
if [ -d "$XMPP_DIR" ]; then
    cd "$XMPP_DIR"
    echo "Installing/updating Node.js dependencies for XMPP server..."
    # Ensure npm is available before running npm install
    if command -v npm &> /dev/null; then
        npm install >> "$XMPP_LOG" 2>&1
        if [ $? -ne 0 ]; then
            echo "WARNING: npm install failed for XMPP server. Check $XMPP_LOG for details."
        else
            echo "npm install for XMPP server completed."
        fi
    else
        echo "ERROR: npm command not found. Cannot install Node.js dependencies. Please install npm."
    fi

    if [ -f "$XMPP_PID_FILE" ] && ps -p $(cat "$XMPP_PID_FILE") > /dev/null; then
        echo "XMPP server already running with PID $(cat "$XMPP_PID_FILE")."
    else
        # Ensure node is available before trying to run
        if command -v node &> /dev/null; then
            nohup node src/index.js >> "$XMPP_LOG" 2>&1 &
            XMPP_PID=$!
            echo $XMPP_PID > "$XMPP_PID_FILE"
            sleep 1
            if ps -p $XMPP_PID > /dev/null; then
                echo "XMPP server started successfully with PID $XMPP_PID. Logs: $XMPP_LOG"
            else
                echo "ERROR: XMPP server failed to start. Check $XMPP_LOG for details (e.g., 'node: No such file or directory' if node is still not found by nohup)."
                rm -f "$XMPP_PID_FILE"
            fi
        else
            echo "ERROR: node command not found. Cannot start XMPP server. Please install Node.js."
        fi
    fi
    cd "$PROJECT_ROOT"
else
    echo "ERROR: XMPP directory $XMPP_DIR not found."
fi

echo "--------------------------------------------------"
echo "Service startup process complete."
echo "To check status (example):"
# Added 2>/dev/null to suppress "cat: No such file or directory" if PID file doesn't exist yet
echo "  XMPP PID: $(cat $XMPP_PID_FILE 2>/dev/null || echo 'Not running/PID file missing')"
echo "To stop services, run: $PROJECT_ROOT/stop_services.sh"
echo "--------------------------------------------------"
