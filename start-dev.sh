#!/bin/bash
cd /home/z/my-project
while true; do
  bun run dev >> /home/z/my-project/dev.log 2>&1
  echo "[restart] dev server exited, restarting in 3s..." >> /home/z/my-project/dev.log 2>&1
  sleep 3
done
