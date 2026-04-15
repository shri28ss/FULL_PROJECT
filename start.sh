#!/bin/bash

# LedgerAI Start Script - Run Only
# This script starts the Backend, ML Service, Parser Backend, and Web Frontend.

# Function to handle cleanup on exit
cleanup() {
    echo "Stopping all services..."
    kill $(jobs -p)
    exit
}

trap cleanup SIGINT SIGTERM

echo "🚀 Starting LedgerAI Services..."

# 1. Main Backend (Node.js)
echo "Starting Node.js Backend..."
(cd CATEGORIZATION/kaif/backend/ && npm run dev) &

# 2. ML Microservice (Python)
echo "Starting ML Microservice..."
(
    cd CATEGORIZATION/kaif/ml-service
    source .venv/bin/activate
    python3 main.py
) &

# 3. Parser Backend (Python)
echo "Starting Parser Backend..."
(
    cd CATEGORIZATION/kaif/parser_backend/
    source .venv/bin/activate
    uvicorn main:app --reload --port 8000
) &

# 4. Web Frontend (React)
echo "Starting Web Frontend..."
(cd CATEGORIZATION/kaif/frontend-web/ && npm run dev) &

echo "✨ All services are starting. Press Ctrl+C to stop all."

# Wait for all background processes
wait
