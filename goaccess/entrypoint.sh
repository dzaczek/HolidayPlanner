#!/bin/sh

# Wait for log file to exist and have content
while [ ! -s /var/log/nginx/access.log ]; do
  echo "Waiting for access.log..."
  sleep 2
done

echo "Starting GoAccess real-time HTML..."

# Start GoAccess in background (generates + updates HTML via WebSocket)
goaccess /var/log/nginx/access.log \
  --log-format=COMBINED \
  --real-time-html \
  --output=/var/www/goaccess/index.html \
  --port=7890 \
  --ws-url=ws://localhost:7890 &

# Wait for HTML to be generated
sleep 2

echo "Starting HTTP server on :7891..."

# Serve the HTML dashboard on port 7891
exec darkhttpd /var/www/goaccess --port 7891 --no-listing
