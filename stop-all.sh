#!/bin/bash

# DailyHub 停止服务脚本
# 从配置文件加载端口

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.json"

# 默认值
DEFAULT_API_PORT=3001
DEFAULT_WEB_PORT=3000

# 从配置文件加载
if [ -f "$CONFIG_FILE" ]; then
    API_PORT=$(python3 -c "import json; f=open('$CONFIG_FILE'); c=json.load(f); print(c.get('api',{}).get('port',$DEFAULT_API_PORT))" 2>/dev/null || echo "$DEFAULT_API_PORT")
    WEB_PORT=$(python3 -c "import json; f=open('$CONFIG_FILE'); c=json.load(f); print(c.get('app',{}).get('web_port',$DEFAULT_WEB_PORT))" 2>/dev/null || echo "$DEFAULT_WEB_PORT")
else
    API_PORT="$DEFAULT_API_PORT"
    WEB_PORT="$DEFAULT_WEB_PORT"
fi

echo "=== 停止 DailyHub 服务 ==="
echo "API 端口: $API_PORT"
echo "前端端口: $WEB_PORT"

pkill -f "gunicorn.*api:app" || true
pkill -f "python3 -m http.server $WEB_PORT" || true
echo "✅ 所有服务已停止"
