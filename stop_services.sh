#!/bin/bash

PROJECT_ROOT="/root/visualalerts_v2" # Adjust if deploying elsewhere
LOG_DIR="$PROJECT_ROOT/logs"
XMPP_PID_FILE="$LOG_DIR/xmpp_server.pid"
API_PID_FILE="$LOG_DIR/api_server.pid"

echo "Stopping services..."

# Function to stop a process
stop_process() {
    local pid_file=$1
    local service_name=$2

    if [ -f "$pid_file" ]; then
        PID=$(cat "$pid_file")
        if ps -p $PID > /dev/null; then
            echo "Stopping $service_name (PID $PID)..."
            kill $PID
            # Wait for graceful shutdown
            for i in {1..5}; do # Wait up to 5 seconds
                if ! ps -p $PID > /dev/null; then
                    break
                fi
                sleep 1
            done
            if ps -p $PID > /dev/null; then
                echo "$service_name (PID $PID) did not stop gracefully, sending SIGKILL..."
                kill -9 $PID
            fi
            rm "$pid_file"
            echo "$service_name stopped."
        else
            echo "$service_name PID file found, but no process with PID $PID running. Cleaning up PID file."
            rm "$pid_file"
        fi
    else
        echo "$service_name PID file not found. Is the service running or was it stopped manually?"
    fi
}

stop_process "$API_PID_FILE" "API Server"
stop_process "$XMPP_PID_FILE" "XMPP Server"

echo "Service shutdown process complete."
