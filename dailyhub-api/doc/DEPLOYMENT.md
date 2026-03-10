# Calendar API 部署指南

本文档详细介绍了 Calendar API 的部署流程、环境配置、生产环境设置和运维管理。

## 目录

- [部署要求](#部署要求)
- [环境设置](#环境设置)
- [本地开发](#本地开发)
- [生产环境部署](#生产环境部署)
- [Docker 部署](#docker-部署)
- [监控与日志](#监控与日志)
- [维护与备份](#维护与备份)
- [故障排查](#故障排查)

---

## 部署要求

### 系统要求

| 组件 | 最低要求 | 推荐配置 |
|------|----------|----------|
| 操作系统 | Linux (Ubuntu 20.04+) | Linux (Ubuntu 22.04 LTS) |
| Python | 3.7+ | 3.9+ |
| 内存 | 256 MB | 512 MB+ |
| 磁盘空间 | 100 MB | 1 GB+ |
| CPU | 1 核 | 2 核+ |

### 依赖软件

```bash
# 系统依赖
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv sqlite3 nginx
```

### Python 依赖

```
flask>=2.3.0
flask-cors>=4.0.0
flask-jwt-extended>=4.5.0
werkzeug>=2.3.0
gunicorn>=21.0.0  # 生产环境推荐
```

---

## 环境设置

### 1. 创建项目目录

```bash
# 创建应用目录
sudo mkdir -p /var/www/calendar-api
sudo chown $USER:$USER /var/www/calendar-api
cd /var/www/calendar-api
```

### 2. 创建虚拟环境

```bash
# 创建虚拟环境
python3 -m venv venv

# 激活虚拟环境
source venv/bin/activate

# 升级 pip
pip install --upgrade pip
```

### 3. 安装依赖

```bash
# 安装生产依赖
pip install -r requirements.txt
pip install gunicorn

# 或者安装完整依赖
pip install flask flask-cors flask-jwt-extended werkzeug gunicorn
```

### 4. 配置应用

复制文件到项目目录：

```bash
# 假设源文件在 /data/lx/calendar/calendar-api/
cp /data/lx/calendar/calendar-api/*.py /var/www/calendar-api/
cp /data/lx/calendar/calendar-api/requirements.txt /var/www/calendar-api/
```

编辑 `config.py`：

```python
# 生产环境配置
import os

# 数据库配置
DATABASE_PATH = os.path.join(os.path.dirname(__file__), 'calendar.db')

# JWT 配置（生产环境必须修改）
JWT_SECRET_KEY = '请使用强随机密钥-建议32位以上随机字符串'
JWT_ACCESS_TOKEN_EXPIRES = 60 * 60 * 24 * 30  # 30 天

# 服务器配置
HOST = '127.0.0.1'  # 使用 127.0.0.1，由 Nginx 代理
PORT = 3001
DEBUG = False

# CORS 配置（生产环境请指定具体域名）
CORS_ORIGINS = ['https://yourdomain.com', 'https://app.yourdomain.com']
```

### 5. 设置文件权限

```bash
# 设置目录权限
chmod 755 /var/www/calendar-api
chmod 644 /var/www/calendar-api/*.py
chmod 600 /var/www/calendar-api/config.py

# 数据库文件权限
chmod 600 /var/www/calendar-api/calendar.db

# 日志文件权限
touch /var/www/calendar-api/api.log
touch /var/www/calendar-api/api_error.log
chmod 644 /var/www/calendar-api/api.log
chmod 644 /var/www/calendar-api/api_error.log
```

---

## 本地开发

### 启动开发服务器

```bash
# 进入项目目录
cd /var/www/calendar-api

# 激活虚拟环境
source venv/bin/activate

# 启动 Flask 开发服务器
python api.py
```

访问 `http://localhost:3001/api/health` 验证服务是否正常运行。

### 开发模式配置

在开发环境可以启用调试模式：

```python
# config.py
DEBUG = True
CORS_ORIGINS = ['*']  # 允许所有来源
```

---

## 生产环境部署

### 方案 1: 使用 Gunicorn + Systemd

#### 1. 创建 Systemd 服务文件

```bash
sudo nano /etc/systemd/system/calendar-api.service
```

```ini
[Unit]
Description=Calendar API Service
After=network.target

[Service]
Type=notify
User=www-data
Group=www-data
WorkingDirectory=/var/www/calendar-api
Environment="PATH=/var/www/calendar-api/venv/bin"
ExecStart=/var/www/calendar-api/venv/bin/gunicorn \
    --workers 4 \
    --bind 127.0.0.1:3001 \
    --access-logfile /var/www/calendar-api/api.log \
    --error-logfile /var/www/calendar-api/api_error.log \
    --log-level info \
    --timeout 60 \
    --enable-stdio-inheritance \
    api:app
ExecReload=/bin/kill -s HUP $MAINPID
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### 2. 启动服务

```bash
# 重载 systemd 配置
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start calendar-api

# 设置开机自启
sudo systemctl enable calendar-api

# 查看服务状态
sudo systemctl status calendar-api

# 查看日志
sudo journalctl -u calendar-api -f
```

#### 3. 配置 Nginx 反向代理

```bash
sudo nano /etc/nginx/sites-available/calendar-api
```

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    # SSL 证书配置
    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 日志
    access_log /var/log/nginx/calendar-api-access.log;
    error_log /var/log/nginx/calendar-api-error.log;

    # 客户端最大请求体大小
    client_max_body_size 10M;

    # 代理设置
    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 健康检查端点（无需认证）
    location /api/health {
        proxy_pass http://127.0.0.1:3001/api/health;
        access_log off;
    }
}
```

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/calendar-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 4. 配置 SSL 证书

使用 Let's Encrypt 免费证书：

```bash
# 安装 certbot
sudo apt-get install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d api.yourdomain.com

# 自动续期
sudo certbot renew --dry-run
```

### 方案 2: 使用 Supervisor

```bash
# 安装 Supervisor
sudo apt-get install supervisor

# 创建配置文件
sudo nano /etc/supervisor/conf.d/calendar-api.conf
```

```ini
[program:calendar-api]
directory=/var/www/calendar-api
command=/var/www/calendar-api/venv/bin/gunicorn -w 4 -b 127.0.0.1:3001 api:app
user=www-data
autostart=true
autorestart=true
stderr_logfile=/var/www/calendar-api/api_error.log
stdout_logfile=/var/www/calendar-api/api.log
```

```bash
# 重载配置
sudo supervisorctl reread
sudo supervisorctl update

# 启动服务
sudo supervisorctl start calendar-api

# 查看状态
sudo supervisorctl status
```

---

## Docker 部署

### 1. 创建 Dockerfile

```dockerfile
# /var/www/calendar-api/Dockerfile
FROM python:3.9-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY requirements.txt .

# 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir gunicorn

# 复制应用文件
COPY *.py ./

# 创建数据目录
RUN mkdir -p /app/data

# 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV HOST=0.0.0.0
ENV PORT=3001

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:3001/api/health')"

# 启动命令
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:3001", "api:app"]
```

### 2. 创建 docker-compose.yml

```yaml
version: '3.8'

services:
  calendar-api:
    build: .
    container_name: calendar-api
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
      - ./calendar.db:/app/calendar.db
      - ./api.log:/app/api.log
      - ./api_error.log:/app/api_error.log
    environment:
      - HOST=0.0.0.0
      - PORT=3001
      - DEBUG=false
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
      - CORS_ORIGINS=${CORS_ORIGINS}
    networks:
      - calendar-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  nginx:
    image: nginx:alpine
    container_name: calendar-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - calendar-api
    networks:
      - calendar-network

networks:
  calendar-network:
    driver: bridge

volumes:
  calendar-data:
```

### 3. 构建和运行

```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f calendar-api

# 停止服务
docker-compose down

# 重启服务
docker-compose restart
```

### 4. 多阶段构建（优化镜像大小）

```dockerfile
# 构建阶段
FROM python:3.9-slim as builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# 运行阶段
FROM python:3.9-slim

WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY *.py .

ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1

EXPOSE 3001
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:3001", "api:app"]
```

---

## 监控与日志

### 日志配置

应用日志位置：

| 日志文件 | 路径 | 说明 |
|----------|------|------|
| 应用日志 | `/var/www/calendar-api/api.log` | 常规日志 |
| 错误日志 | `/var/www/calendar-api/api_error.log` | 错误日志 |
| Nginx 访问日志 | `/var/log/nginx/calendar-api-access.log` | Nginx 访问日志 |
| Nginx 错误日志 | `/var/log/nginx/calendar-api-error.log` | Nginx 错误日志 |
| Systemd 日志 | `journalctl -u calendar-api` | Systemd 服务日志 |

### 日志轮转

创建 logrotate 配置：

```bash
sudo nano /etc/logrotate.d/calendar-api
```

```
/var/www/calendar-api/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        systemctl reload calendar-api > /dev/null 2>&1 || true
    endscript
}
```

### 监控脚本

创建监控脚本：

```bash
#!/bin/bash
# /usr/local/bin/check-calendar-api.sh

# 检查服务状态
if ! systemctl is-active --quiet calendar-api; then
    echo "Calendar API service is down!" | mail -s "Alert: Calendar API Down" admin@example.com
    systemctl restart calendar-api
fi

# 检查磁盘空间
DISK_USAGE=$(df /var/www/calendar-api | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    echo "Disk usage is ${DISK_USAGE}%" | mail -s "Alert: High Disk Usage" admin@example.com
fi

# 检查健康端点
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health)
if [ $HEALTH -ne 200 ]; then
    echo "Health check failed with status $HEALTH" | mail -s "Alert: Health Check Failed" admin@example.com
fi
```

添加到 crontab：

```bash
# 每 5 分钟检查一次
*/5 * * * * /usr/local/bin/check-calendar-api.sh
```

### 性能监控

使用 Prometheus + Grafana：

```python
# 添加到 api.py
from prometheus_flask_exporter import PrometheusMetrics

metrics = PrometheusMetrics(app)
```

---

## 维护与备份

### 数据库备份

#### 自动备份脚本

```bash
#!/bin/bash
# /usr/local/bin/backup-calendar.sh

BACKUP_DIR="/backup/calendar"
DATE=$(date +%Y%m%d_%H%M%S)
DB_PATH="/var/www/calendar-api/calendar.db"

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份数据库
cp $DB_PATH $BACKUP_DIR/calendar_$DATE.db

# 压缩备份
gzip $BACKUP_DIR/calendar_$DATE.db

# 删除 30 天前的备份
find $BACKUP_DIR -name "calendar_*.db.gz" -mtime +30 -delete

echo "Backup completed: calendar_$DATE.db.gz"
```

#### 定时备份

```bash
# 添加到 crontab
# 每天凌晨 2 点备份
0 2 * * * /usr/local/bin/backup-calendar.sh
```

### 数据库恢复

```bash
# 停止服务
sudo systemctl stop calendar-api

# 恢复数据库
cp /backup/calendar/calendar_20240227_020000.db.gz /tmp/
gunzip /tmp/calendar_20240227_020000.db.gz
cp /tmp/calendar_20240227_020000.db /var/www/calendar-api/calendar.db

# 重启服务
sudo systemctl start calendar-api
```

### 日志清理

```bash
#!/bin/bash
# 清理 30 天前的日志
find /var/www/calendar-api -name "*.log" -mtime +30 -delete
```

### 更新部署

```bash
#!/bin/bash
# /usr/local/bin/update-calendar-api.sh

# 备份
/usr/local/bin/backup-calendar.sh

# 拉取最新代码
cd /var/www/calendar-api
git pull origin main

# 更新依赖
source venv/bin/activate
pip install -r requirements.txt

# 重启服务
sudo systemctl restart calendar-api

echo "Update completed"
```

---

## 故障排查

### 常见问题

#### 1. 服务无法启动

```bash
# 检查服务状态
sudo systemctl status calendar-api

# 查看详细日志
sudo journalctl -u calendar-api -n 100

# 检查端口占用
sudo netstat -tlnp | grep 3001

# 检查配置
python3 -m py_compile api.py
```

#### 2. 数据库锁定

```bash
# 检查数据库锁
sqlite3 calendar.db "PRAGMA database_list;"

# 清理 WAL 文件
sqlite3 calendar.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

#### 3. 内存不足

```bash
# 检查内存使用
free -h

# 检查进程内存
ps aux | grep gunicorn

# 调整 worker 数量
# 在 systemd 服务文件中减少 --workers 数量
```

#### 4. 权限问题

```bash
# 修复文件权限
sudo chown -R www-data:www-data /var/www/calendar-api
sudo chmod 644 /var/www/calendar-api/*.py
sudo chmod 600 /var/www/calendar-api/calendar.db
```

#### 5. CORS 错误

```bash
# 检查 CORS 配置
grep CORS_ORIGINS config.py

# 临时允许所有来源（仅用于调试）
CORS_ORIGINS = ['*']
```

### 调试模式

启用调试模式：

```python
# config.py
DEBUG = True
```

重启服务后查看详细错误信息：

```bash
sudo systemctl restart calendar-api
sudo journalctl -u calendar-api -f
```

### 性能调优

#### Gunicorn 配置

```bash
# 根据 CPU 核心数调整 worker 数量
workers = (2 * CPU核心数) + 1

# 示例配置
ExecStart=/var/www/calendar-api/venv/bin/gunicorn \
    --workers 4 \
    --worker-class sync \
    --worker-connections 1000 \
    --max-requests 1000 \
    --max-requests-jitter 50 \
    --timeout 60 \
    --keepalive 5 \
    --bind 127.0.0.1:3001 \
    api:app
```

#### SQLite 优化

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-2000;
PRAGMA temp_store=MEMORY;
```

---

## 安全加固

### 1. 防火墙配置

```bash
# 配置 UFW
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 2. 修改 JWT 密钥

```python
# 生成随机密钥
import secrets
print(secrets.token_urlsafe(32))

# 更新 config.py
JWT_SECRET_KEY = '生成的随机密钥'
```

### 3. 限制 API 访问

```nginx
# Nginx 配置速率限制
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

location /api/ {
    limit_req zone=api_limit burst=20 nodelay;
    proxy_pass http://127.0.0.1:3001/api/;
}
```

### 4. 启用 HTTPS

```bash
# 使用 Let's Encrypt
sudo certbot --nginx -d api.yourdomain.com
```

---

## 扩展部署

### 负载均衡

使用 Nginx 负载均衡多个实例：

```nginx
upstream calendar_api {
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
}

server {
    location /api/ {
        proxy_pass http://calendar_api;
    }
}
```

### 数据库迁移

当需要迁移到 PostgreSQL/MySQL 时：

```python
# 更新 database.py 使用 SQLAlchemy
from sqlalchemy import create_engine
engine = create_engine('postgresql://user:password@localhost/calendar')
```

---

## 版本升级

```bash
#!/bin/bash
# 升级脚本

# 1. 备份
/usr/local/bin/backup-calendar.sh

# 2. 停止服务
sudo systemctl stop calendar-api

# 3. 更新代码
git pull origin main

# 4. 更新依赖
source venv/bin/activate
pip install -r requirements.txt

# 5. 数据库迁移（如有）
# python migrate.py

# 6. 启动服务
sudo systemctl start calendar-api

# 7. 验证
curl http://localhost:3001/api/health
```
