@echo off
echo Tank Wars - starting local server on http://localhost:8000
echo (GLB needs a server; do not open index.html by double-click)
python -m http.server 8000
