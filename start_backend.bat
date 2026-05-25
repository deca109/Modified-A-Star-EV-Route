@echo off
echo ==========================================
echo  EV Route Optimizer - Backend Server
echo ==========================================
echo.
cd /d "%~dp0backend"

if not exist "venv\Scripts\python.exe" (
    echo Creating virtual environment...
    python -m venv venv
    echo Installing dependencies...
    venv\Scripts\pip install -r requirements.txt
)

echo Starting FastAPI backend on http://localhost:8000
echo API Docs: http://localhost:8000/docs
echo.
set PYTHONPATH=..
venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
