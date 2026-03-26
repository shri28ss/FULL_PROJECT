#!/bin/bash
# LedgerAI Quick Start Script
# Run this after configuring .env with your credentials

echo "🚀 Starting LedgerAI..."
echo ""

# Check if .env is configured
if grep -q "your-project-ref" .env 2>/dev/null; then
    echo "⚠️  WARNING: .env file still has placeholder values!"
    echo "Please edit .env with your actual Supabase and Gemini credentials."
    echo ""
    exit 1
fi

# Start backend in background
echo "📦 Starting backend server..."
cd backend
source .venv/bin/activate
python -m uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# Wait for backend to start
echo "⏳ Waiting for backend to initialize..."
sleep 3

# Start frontend
echo "🎨 Starting frontend server..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ LedgerAI is running!"
echo ""
echo "📍 Frontend: http://localhost:5173"
echo "📍 Backend:  http://localhost:8000"
echo "📍 Health:   http://localhost:8000/health"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Wait for Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo ''; echo '👋 Stopped LedgerAI'; exit" INT
wait
