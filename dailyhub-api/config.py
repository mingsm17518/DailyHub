# DailyHub API 配置文件
# 复制 config.py 为 config.py 并修改配置

import os
import json

# 配置文件路径
CONFIG_FILE = os.path.join(os.path.dirname(__file__), '..', 'config.json')

# 默认配置
DEFAULT_CONFIG = {
    'api': {
        'host': '0.0.0.0',
        'port': 3001,
        'jwt_secret_key': 'change-this-to-a-random-string-in-production',
        'jwt_token_expires_days': 30,
        'debug': False,
        'cors_origins': ['*']
    }
}

# 加载配置
def load_config():
    config = DEFAULT_CONFIG.copy()
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                user_config = json.load(f)
                config.update(user_config)
        except Exception as e:
            print(f"Warning: Failed to load config.json: {e}")
    return config

# 获取配置
_config = load_config()

# 数据库配置
DATABASE_PATH = os.path.join(os.path.dirname(__file__), 'dailyhub.db')

# JWT 配置
JWT_SECRET_KEY = _config.get('api', {}).get('jwt_secret_key', 'change-this-secret')
JWT_ACCESS_TOKEN_EXPIRES = 60 * 60 * 24 * _config.get('api', {}).get('jwt_token_expires_days', 30)

# 服务器配置
HOST = _config.get('api', {}).get('host', '0.0.0.0')
PORT = _config.get('api', {}).get('port', 3001)
DEBUG = _config.get('api', {}).get('debug', False)

# CORS 配置
CORS_ORIGINS = _config.get('api', {}).get('cors_origins', ['*'])
