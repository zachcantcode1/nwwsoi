#!/bin/bash

# Define project root and service directories for the Debian server
PROJECT_ROOT="/root/visualalerts_v2" # <--- IMPORTANT: Adjusted for Debian server
XMPP_DIR="$PROJECT_ROOT/nwws-xmpp-monitor"
API_SCRIPT_PATH="$PROJECT_ROOT/weather_alerts/api_server.py"
REQUIREMENTS_PATH="$PROJECT_ROOT/weather_alerts/requirements.txt"
LOG_DIR="$PROJECT_ROOT/logs"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Define log file paths
XMPP_LOG="$LOG_DIR/xmpp_server.log"
API_LOG="$LOG_DIR/api_server.log" # For stdout/stderr of python command and pip install

# Define PID file paths
XMPP_PID_FILE="$LOG_DIR/xmpp_server.pid"
API_PID_FILE="$LOG_DIR/api_server.pid"

echo "Starting services on Debian server..."
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

# --- Start API Server (Python/Flask) ---
echo "Attempting to start API server..."
PYTHON_VENV_ACTIVATE="$PROJECT_ROOT/.venv/bin/activate"

if [ -f "$API_PID_FILE" ] && ps -p $(cat "$API_PID_FILE") > /dev/null; then
    echo "API server already running with PID $(cat "$API_PID_FILE")."
else
    if [ -f "$PYTHON_VENV_ACTIVATE" ]; then
        source "$PYTHON_VENV_ACTIVATE"
        echo "Python virtual environment activated."

        if [ -f "$REQUIREMENTS_PATH" ]; then
            echo "Installing/updating Python dependencies for API server from $REQUIREMENTS_PATH..."
            pip install -r "$REQUIREMENTS_PATH" >> "$API_LOG" 2>&1
            if [ $? -ne 0 ]; then
                echo "ERROR: pip install -r $REQUIREMENTS_PATH failed for API server. Check $API_LOG for details."
                # Deactivate and exit or handle error appropriately
                # deactivate
                # exit 1 # Example: exit if pip install fails
            else
                echo "pip install for API server completed."
            fi
        else
            echo "WARNING: requirements.txt not found at $REQUIREMENTS_PATH. Skipping Python dependency installation."
        fi

        echo "Starting Flask application: $API_SCRIPT_PATH"
        nohup python "$API_SCRIPT_PATH" >> "$API_LOG" 2>&1 &
        API_PID=$!
        echo $API_PID > "$API_PID_FILE"
        sleep 2 # Give it a bit more time to start or fail
        if ps -p $API_PID > /dev/null; then
            echo "API server started successfully with PID $API_PID. Main logs (from Flask app): $PROJECT_ROOT/weather_alerts/flask_server.log. Startup/pip logs: $API_LOG"
        else
            echo "ERROR: API server failed to start. Check $API_LOG and $PROJECT_ROOT/weather_alerts/flask_server.log for details (e.g., ModuleNotFoundError)."
            rm -f "$API_PID_FILE"
        fi
        # Deactivate after starting the background process
        # The 'deactivate' command might not be available if the script exits immediately
        # or if it's run in a non-interactive shell that doesn't fully source the venv's deactivate logic.
        # For nohup background processes, the venv activation persists for the launched process.
    else
        echo "ERROR: Python virtual environment not found at $PYTHON_VENV_ACTIVATE. API server not started."
        echo "Please ensure you have created a virtual environment (e.g., python3 -m venv $PROJECT_ROOT/.venv) on the server."
    fi
fi

echo "--------------------------------------------------"
echo "Service startup process complete."
echo "To check status (example):"
# Added 2>/dev/null to suppress "cat: No such file or directory" if PID file doesn't exist yet
echo "  XMPP PID: $(cat $XMPP_PID_FILE 2>/dev/null || echo 'Not running/PID file missing')"
echo "  API PID:  $(cat $API_PID_FILE 2>/dev/null || echo 'Not running/PID file missing')"
echo "To stop services, run: $PROJECT_ROOT/stop_services.sh"
echo "--------------------------------------------------"
