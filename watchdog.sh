#!/bin/bash
# DISTORT watchdog - keeps dev server alive forever
cd /home/z/my-project

LOG=/home/z/my-project/dev.log
PIDFILE=/home/z/my-project/.dev.pid

while true; do
  # Check if server is alive
  if ! curl -s -o /dev/null --max-time 3 http://localhost:3000/ 2>/dev/null; then
    echo "[$(date)] Server dead, restarting..." >> "$LOG"
    # Kill any stale processes
    pkill -9 -f "next dev" 2>/dev/null
    pkill -9 -f "next-server" 2>/dev/null
    sleep 2
    # Start fresh
    bun run dev >> "$LOG" 2>&1 &
    echo $! > "$PIDFILE"
    echo "[$(date)] Started PID $(cat $PIDFILE)" >> "$LOG"
    sleep 12
    # Verify it's up
    if curl -s -o /dev/null --max-time 5 http://localhost:3000/ 2>/dev/null; then
      echo "[$(date)] Server is UP" >> "$LOG"
    else
      echo "[$(date)] Server failed to start, retrying..." >> "$LOG"
    fi
  fi
  sleep 8
done
