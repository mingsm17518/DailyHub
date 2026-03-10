#!/bin/bash

# DailyHub API 启动脚本
# 从配置文件加载路径和端口

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.json"

# 默认值
DEFAULT_API_DIR="$SCRIPT_DIR/dailyhub-api"
DEFAULT_WEB_DIR="$SCRIPT_DIR/dailyhub-app"
DEFAULT_PORT=3001

# 从配置文件加载
if [ -f "$CONFIG_FILE" ]; then
    # 使用 python 解析 JSON
    API_DIR=$(python3 -c "import json; f=open('$CONFIG_FILE'); c=json.load(f); print(c.get('paths',{}).get('api_dir','$DEFAULT_API_DIR'))" 2>/dev/null || echo "$DEFAULT_API_DIR")
    PORT=$(python3 -c "import json; f=open('$CONFIG_FILE'); c=json.load(f); print(c.get('api',{}).get('port',$DEFAULT_PORT))" 2>/dev/null || echo "$DEFAULT_PORT")
    API_BASE_URL=$(python3 -c "import json; f=open('$CONFIG_FILE'); c=json.load(f); print(c.get('app',{}).get('api_base_url','http://localhost:3001/api'))" 2>/dev/null || echo "http://localhost:3001/api")
else
    API_DIR="$DEFAULT_API_DIR"
    PORT="$DEFAULT_PORT"
    API_BASE_URL="http://localhost:3001/api"
fi

VENV_DIR="$API_DIR/venv"
LOG_DIR="$API_DIR/logs"

echo "=== DailyHub API 启动脚本 ==="
echo "API 目录: $API_DIR"
echo "API 端口: $PORT"

# 创建日志目录
mkdir -p "$LOG_DIR"

# 进入 API 目录
cd "$API_DIR"

# 检查虚拟环境
if [ ! -d "$VENV_DIR" ]; then
    echo "创建虚拟环境..."
    python3 -m venv "$VENV_DIR"
fi

# 激活虚拟环境
source "$VENV_DIR/bin/activate"

# 安装/更新依赖
echo "检查依赖..."
pip install -q flask flask-cors flask-jwt-extended werkzeug gunicorn 2>/dev/null

# 停止已存在的进程
echo "停止旧进程..."
pkill -f "gunicorn.*api:app" || true
sleep 1

# 启动 API
echo "启动 API 服务 (端口 $PORT)..."
nohup gunicorn -w 4 -b 0.0.0.0:$PORT \
    --access-logfile "$LOG_DIR/access.log" \
    --error-logfile "$LOG_DIR/error.log" \
    --log-level info \
    --daemon \
    api:app

sleep 2

# 检查服务是否启动
if curl -s http://localhost:$PORT/api/health > /dev/null; then
    echo "✅ API 启动成功!"
    echo "   API 地址: $API_BASE_URL"
else
    echo "❌ API 启动失败，查看日志:"
    tail -20 "$LOG_DIR/error.log"
    exit 1
fi

# 显示进程信息
echo ""
echo "=== 进程信息 ==="
ps aux | grep gunicorn | grep api:app | grep -v grep

echo ""
echo "=== 日志 ==="
echo "访问日志: $LOG_DIR/access.log"
echo "错误日志: $LOG_DIR/error.log"
echo ""
echo "查看实时日志: tail -f $LOG_DIR/access.log"
