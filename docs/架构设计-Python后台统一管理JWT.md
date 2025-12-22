# 架构设计：Python 后台统一管理 JWT

## 系统架构图

```
┌──────────────────────────────────────────────────────────────┐
│                      前端层（React + Next.js）                │
│                                                              │
│  - 用户界面                                                   │
│  - 调用 Python API 获取 LiveKit Token                        │
│  - 使用 Token 连接 LiveKit                                   │
│                                                              │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP/HTTPS
                         ↓
┌──────────────────────────────────────────────────────────────┐
│                   Python 后台管理程序（FastAPI/Django）        │
│                                                              │
│  ┌────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │  用户管理模块   │  │  认证授权模块     │  │ LiveKit 模块 │ │
│  │                │  │                  │  │              │ │
│  │ - 注册/登录    │  │ - JWT Auth       │  │ - Token 签发 │ │
│  │ - 用户信息     │  │ - 权限控制       │  │ - 房间管理   │ │
│  │ - 角色管理     │  │ - Session 管理   │  │ - 权限分配   │ │
│  └────────────────┘  └──────────────────┘  └──────────────┘ │
│                                                              │
│  环境变量：                                                   │
│  - LIVEKIT_API_KEY                                          │
│  - LIVEKIT_API_SECRET                                       │
│  - LIVEKIT_URL                                              │
│                                                              │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ↓
┌──────────────────────────────────────────────────────────────┐
│                      LiveKit 服务器                          │
│                                                              │
│  - 验证 JWT Token                                            │
│  - 管理房间和参与者                                           │
│  - 处理音视频流                                               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## API 设计

### 1. 用户认证 API

```
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "******"
}

响应：
{
  "access_token": "eyJhbGci...",  # 用户认证 Token（JWT）
  "user": {
    "id": "123",
    "name": "张三",
    "role": "premium_user"
  }
}
```

### 2. 获取 LiveKit Token API

```
POST /api/livekit/token
Headers:
  Authorization: Bearer <access_token>

Body:
{
  "room_name": "meeting_room_001",  # 可选，不传则自动生成
  "participant_name": "张三"
}

响应：
{
  "token": "eyJhbGci...",  # LiveKit JWT Token
  "url": "wss://your-livekit.com",
  "room_name": "meeting_room_001",
  "participant_identity": "user_123",
  "ttl": 900  # 15分钟
}
```

## Python 后台实现示例

### 安装依赖

```bash
pip install livekit-server-sdk fastapi uvicorn pyjwt python-dotenv
```

### FastAPI 实现

```python
# main.py
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from livekit import api
from pydantic import BaseModel
import os
from datetime import datetime, timedelta
import jwt

app = FastAPI()

# CORS 配置（允许 React 前端调用）
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # 开发环境
        "https://yourdomain.com"  # 生产环境
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# LiveKit 配置
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")
LIVEKIT_URL = os.getenv("LIVEKIT_URL")

# 用户认证密钥（用于签发用户登录 Token，与 LiveKit 无关）
JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key")

# ==================== 数据模型 ====================

class LoginRequest(BaseModel):
    email: str
    password: str

class LiveKitTokenRequest(BaseModel):
    room_name: str | None = None
    participant_name: str | None = None

# ==================== 辅助函数 ====================

def verify_user_token(authorization: str = Header(None)):
    """验证用户认证 Token"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未授权")
    
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload  # 返回用户信息
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token 已过期")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="无效的 Token")

# ==================== API 路由 ====================

@app.post("/api/auth/login")
async def login(req: LoginRequest):
    """用户登录（简化示例）"""
    # TODO: 实际应该验证数据库
    if req.email == "demo@example.com" and req.password == "demo123":
        user = {
            "id": "user_123",
            "email": req.email,
            "name": "演示用户",
            "role": "premium"
        }
        
        # 签发用户认证 Token（15天有效）
        access_token = jwt.encode(
            {
                **user,
                "exp": datetime.utcnow() + timedelta(days=15)
            },
            JWT_SECRET,
            algorithm="HS256"
        )
        
        return {
            "access_token": access_token,
            "user": user
        }
    
    raise HTTPException(status_code=401, detail="用户名或密码错误")

@app.post("/api/livekit/token")
async def get_livekit_token(
    req: LiveKitTokenRequest,
    user: dict = Depends(verify_user_token)
):
    """签发 LiveKit Token（需要用户登录）"""
    
    # 根据用户角色设置不同权限
    can_publish = user.get("role") == "premium"  # 只有高级用户能发布
    
    # 生成房间名（如果没有提供）
    room_name = req.room_name or f"room_{user['id']}_{int(datetime.now().timestamp())}"
    
    # 参与者信息
    participant_identity = user["id"]
    participant_name = req.participant_name or user.get("name", "用户")
    
    # 创建 LiveKit Token
    token = (
        api.AccessToken()
        .with_identity(participant_identity)
        .with_name(participant_name)
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=can_publish,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        .with_ttl(timedelta(minutes=15))  # 15分钟有效
        .to_jwt()
    )
    
    return {
        "token": token,
        "url": LIVEKIT_URL,
        "room_name": room_name,
        "participant_identity": participant_identity,
        "participant_name": participant_name,
        "ttl": 900,
        "permissions": {
            "can_publish": can_publish,
            "can_subscribe": True
        }
    }

@app.get("/api/user/me")
async def get_current_user(user: dict = Depends(verify_user_token)):
    """获取当前用户信息"""
    return {"user": user}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### .env 配置

```bash
# Python 后台环境变量
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_URL=wss://your-livekit-server.com

JWT_SECRET=your-jwt-secret-for-user-auth
```

## React 前端调整

### 1. 修改 `hooks/useConnectionDetails.ts`

```typescript
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';  // 假设你有认证 Hook

export default function useConnectionDetails() {
  const { token } = useAuth();  // 用户登录 Token
  const [connectionDetails, setConnectionDetails] = useState(null);

  const fetchConnectionDetails = useCallback(async () => {
    if (!token) {
      console.error('用户未登录');
      return;
    }

    setConnectionDetails(null);
    
    try {
      const response = await fetch('http://localhost:8000/api/livekit/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,  // 用户认证 Token
        },
        body: JSON.stringify({
          participant_name: '用户名',
          // room_name: 'my_room'  // 可选
        })
      });

      if (!response.ok) {
        throw new Error('获取 Token 失败');
      }

      const data = await response.json();
      setConnectionDetails({
        serverUrl: data.url,
        roomName: data.room_name,
        participantToken: data.token,
        participantName: data.participant_name,
      });
    } catch (error) {
      console.error('Error fetching LiveKit token:', error);
    }
  }, [token]);

  useEffect(() => {
    fetchConnectionDetails();
  }, [fetchConnectionDetails]);

  return { connectionDetails, refreshConnectionDetails: fetchConnectionDetails };
}
```

### 2. 环境变量配置（React）

```bash
# .env.local
NEXT_PUBLIC_PYTHON_API_URL=http://localhost:8000

# 不再需要这些（已移到 Python 后台）
# LIVEKIT_API_KEY=...
# LIVEKIT_API_SECRET=...
```

## 安全优势

### 集中式密钥管理
- ✅ LiveKit 密钥只存在于 Python 后台
- ✅ 前端项目不持有任何敏感信息
- ✅ 即使前端代码泄露，也无法签发 Token

### 细粒度权限控制
```python
# 可以根据用户角色动态设置权限
if user["role"] == "admin":
    can_publish = True
    can_publish_data = True
    can_update_metadata = True
elif user["role"] == "premium":
    can_publish = True
    can_publish_data = True
    can_update_metadata = False
else:
    can_publish = False  # 免费用户只能观看
    can_publish_data = False
    can_update_metadata = False
```

### 审计追踪
```python
# 记录每次 Token 签发
@app.post("/api/livekit/token")
async def get_livekit_token(...):
    # ... 签发 Token ...
    
    # 记录日志
    await db.audit_log.create({
        "user_id": user["id"],
        "action": "livekit_token_issued",
        "room_name": room_name,
        "timestamp": datetime.now(),
        "ip_address": request.client.host
    })
    
    return {...}
```

## 运行步骤

### 1. 启动 Python 后台
```bash
cd python-backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. 启动 React 前端
```bash
cd agent-starter-react
pnpm install
pnpm dev
```

### 3. 测试流程
1. 用户在前端登录 → 获得用户认证 Token
2. 前端携带认证 Token 调用 `/api/livekit/token` → 获得 LiveKit Token
3. 前端使用 LiveKit Token 连接 LiveKit 服务器

## 迁移步骤

### Step 1: 保留当前功能
- 暂时保留 Next.js 的 `/api/connection-details` 路由
- Python 后台开发完成后再删除

### Step 2: 逐步迁移
1. 先实现 Python 登录 API
2. 再实现 Python LiveKit Token API
3. 前端添加登录功能
4. 前端切换到 Python API
5. 删除 Next.js 的 Token 签发代码

### Step 3: 环境变量清理
```bash
# 从 React 项目的 .env.local 删除
- LIVEKIT_API_KEY
- LIVEKIT_API_SECRET
- LIVEKIT_URL

# 只保留 Python API 地址
+ NEXT_PUBLIC_PYTHON_API_URL=http://localhost:8000
```

## 性能对比

| 指标 | Next.js 本地签发 | Python 统一管理 |
|------|-----------------|----------------|
| 响应时间 | ~10ms | ~30-50ms |
| 安全性 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 可维护性 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 可扩展性 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| 权限控制 | ⭐⭐ | ⭐⭐⭐⭐⭐ |

## 结论

**推荐使用 Python 统一管理**，因为：
1. 你已经计划做 Python 后台用户管理系统
2. 安全性和可维护性大幅提升
3. 支持复杂的业务逻辑和权限控制
4. 性能损失可以忽略不计（20-40ms）
5. 符合微服务架构最佳实践

