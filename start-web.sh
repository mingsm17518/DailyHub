#!/bin/bash

# DailyHub 前端启动脚本
# 从配置文件加载路径和端口

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.json"

# 默认值
DEFAULT_WEB_DIR="$SCRIPT_DIR/dailyhub-app"
DEFAULT_WEB_PORT=3000

# 从配置文件加载
if [ -f "$CONFIG_FILE" ]; then
    WEB_DIR=$(python3 -c "import json; f=open('$CONFIG_FILE'); c=json.load(f); print(c.get('paths',{}).get('web_dir','$DEFAULT_WEB_DIR'))" 2>/dev/null || echo "$DEFAULT_WEB_DIR")
    WEB_PORT=$(python3 -c "import json; f=open('$CONFIG_FILE'); c=json.load(f); print(c.get('app',{}).get('web_port',$DEFAULT_WEB_PORT))" 2>/dev/null || echo "$DEFAULT_WEB_PORT")
else
    WEB_DIR="$DEFAULT_WEB_DIR"
    WEB_PORT="$DEFAULT_WEB_PORT"
fi

echo "=== DailyHub 前端启动脚本 ==="
echo "前端目录: $WEB_DIR"
echo "前端端口: $WEB_PORT"

# 进入前端目录
cd "$WEB_DIR"

# 停止已存在的进程
echo "停止旧进程..."
pkill -f "python3 -m http.server $WEB_PORT" || true
sleep 1

# 启动前端
echo "启动前端服务 (端口 $WEB_PORT)..."
nohup python3 -m http.server $WEB_PORT > /dev/null 2>&1 &

sleep 2

# 检查服务是否启动
if curl -s http://localhost:$WEB_PORT > /dev/null; then
    echo "✅ 前端启动成功!"
    echo "   访问地址: http://localhost:$WEB_PORT"
else
    echo "❌ 前端启动失败"
    exit 1
fi
