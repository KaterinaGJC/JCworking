@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   景臣的工作生活 · 本地预览
echo   打开浏览器访问：http://127.0.0.1:8123
echo   手机同 Wi-Fi 可用：http://本机IP:8123 （需替换为你的局域网 IP）
echo   按 Ctrl+C 停止
echo.
start "" http://127.0.0.1:8123
node tools\server.mjs app 8123
