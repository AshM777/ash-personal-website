#!/bin/bash

# Kill any process running on port 4321
lsof -t -i:4321 | xargs kill -9 2>/dev/null

echo "Server stopped. Starting fresh..."

# Start the dev server
npm run dev
