@echo off
REM Quick Start Script for Ledger AI
REM Last Updated: 2026-03-20

echo.
echo ================================================
echo          LEDGER AI - QUICK START
echo ================================================
echo.
echo Checking environment...
echo.

REM Check if backend venv exists
if not exist "backend\venv\Scripts\activate.bat" (
    echo [ERROR] Backend virtual environment not found!
    echo Please run: cd backend ^&^& python -m venv venv ^&^& .\venv\Scripts\activate ^&^& pip install -r requirements.txt
    pause
    exit /b 1
)

REM Check if frontend node_modules exists
if not exist "frontend\node_modules" (
    echo [ERROR] Frontend dependencies not installed!
    echo Please run: cd frontend ^&^& npm install
    pause
    exit /b 1
)

REM Check if .env exists
if not exist "backend\.env" (
    echo [WARNING] backend\.env file not found!
    echo Please create backend\.env with your API keys
    pause
)

echo [OK] Backend virtual environment found
echo [OK] Frontend dependencies installed
echo [OK] Environment configuration found
echo.
echo ================================================
echo Starting services...
echo ================================================
echo.

echo [1/2] Starting Backend API (Port 8000)...
start "Ledger AI - Backend API" cmd /k "cd backend && .\venv\Scripts\activate && uvicorn backend:app --reload"
timeout /t 2 /nobreak >nul

echo [2/2] Starting Frontend Dev Server (Port 5173)...
start "Ledger AI - Frontend" cmd /k "cd frontend && npm run dev"
timeout /t 2 /nobreak >nul

echo.
echo ================================================
echo          ALL SERVICES STARTED!
echo ================================================
echo.
echo Backend API:  http://localhost:8000
echo API Docs:     http://localhost:8000/docs
echo Frontend UI:  http://localhost:5173
echo.
echo Keep both terminal windows open!
echo Press any key to exit this launcher...
echo ================================================
pause >nul
