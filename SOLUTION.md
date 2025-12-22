# LiveKit WebSocket 401 错误 - 完整解决方案

## 📊 问题诊断结果

### ❌ 发现的问题

1. **Token 格式错误**
   - 用户管理服务（http://10.0.0.7:8000）返回的 token 不是标准 JWT 格式
   - 错误格式：`lk_demo_iW4eC9IXY05Xlo8dsZ5ZC5ThMO-1PtQfF5UuByYRVdw`
   - 正确格式：`eyJhbGci...abc123.eyJzdWIi...xyz789.SflKxwRJ...signature`（三部分）

2. **验证失败**
   - LiveKit 服务器期望标准的 JWT token（header.payload.signature）
   - 收到的却是一个简单的 base64url 编码字符串
   - 导致返回 `401 Unauthorized` 错误

### ✅ 已确认正常的部分

- ✅ 前端 Next.js 配置正确
- ✅ Ticket 系统可正常通信
- ✅ 环境变量配置完整
- ✅ Next.js API 路由工作正常

---

## 🎯 解决方案

### **方案 1：修复用户管理服务（推荐）** ⭐⭐⭐⭐⭐

#### 问题根源

用户管理服务在生成 LiveKit token 时使用了错误的方法。

#### 正确的实现方式

用户管理服务需要使用 **LiveKit Server SDK** 生成标准 JWT。

##### Python 示例（推荐）

```python
from livekit import api
from datetime import timedelta

def generate_livekit_token(
    identity: str,
    room_name: str,
    participant_name: str = None
):
    # 这些密钥必须与 LiveKit 服务器配置一致！
    api_key = "devkey"  # 从环境变量读取
    api_secret = "secretsecretsecretsecretsecretsecret"  # 从环境变量读取
    
    token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(identity)
        .with_name(participant_name or identity)
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        .with_ttl(timedelta(minutes=15))
        .to_jwt()  # ← 关键：这里生成标准 JWT
    )
    
    return token
```

##### Node.js 示例

```javascript
import { AccessToken } from 'livekit-server-sdk';

function generateLivekitToken(identity, roomName, participantName) {
  const apiKey = 'devkey';
  const apiSecret = 'secretsecretsecretsecretsecretsecret';
  
  const at = new AccessToken(apiKey, apiSecret, {
    identity: identity,
    name: participantName || identity,
    ttl: '15m',
  });
  
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  
  return at.toJwt(); // 返回标准 JWT
}
```

#### 关键检查点

1. **密钥必须一致**
   ```bash
   # 用户管理服务的密钥
   LIVEKIT_API_KEY=devkey
   LIVEKIT_API_SECRET=secretsecretsecretsecretsecretsecret
   
   # 必须与 LiveKit 服务器配置完全一致！
   ```

2. **使用官方 SDK**
   - Python: `pip install livekit-server-sdk`
   - Node.js: `npm install livekit-server-sdk`

3. **调用 `.to_jwt()` 或 `.toJwt()`**
   这是生成标准 JWT 的关键步骤

---

### **方案 2：暂时使用本地开发模式（临时绕过）** ⭐⭐⭐

如果暂时无法修改用户管理服务，可以先不使用 ticket 进行测试：

#### 步骤

1. 打开浏览器访问：`http://localhost:3000`
2. **不要点击"我有票据"按钮**
3. 直接点击"开始通话"按钮

这样会使用本地 GET 模式，Next.js 会直接生成正确的 token：

```typescript
// GET /api/connection-details
// 使用本地配置的 LIVEKIT_API_KEY 和 LIVEKIT_API_SECRET 生成 token
const participantToken = await createParticipantToken(
  { identity: `voice_assistant_user_${Math.floor(Math.random() * 10_000)}` },
  roomName
);
```

#### 优点
- ✅ 立即可用，无需等待服务端修复
- ✅ 适合本地开发和测试

#### 缺点
- ❌ 无法使用 ticket 系统的功能
- ❌ 不能与用户管理系统集成

---

### **方案 3：联系用户管理服务维护者**

如果你不负责维护用户管理服务（http://10.0.0.7:8000），请：

1. **提供这个报告**给维护者
2. **关键信息**：
   - 当前返回的 token 格式不正确
   - 需要使用 LiveKit SDK 的 `.to_jwt()` 方法
   - 密钥必须与 LiveKit 服务器一致

---

## 🔧 验证修复

修复后，可以用以下方式验证 token 是否正确：

### 1. 检查 Token 格式

正确的 LiveKit JWT 应该：
- 包含两个点（`.`）分隔三个部分
- 类似：`eyJhbGci...abc.eyJzdWIi...xyz.SflKxwRJ...sig`

### 2. 解码验证

```bash
# 获取 token
curl -s http://10.0.0.7:8000/api/v1/tickets/tkt_e26dbdbb/consume \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"profile": {"display_name": "测试"}}' \
  | python3 -m json.tool

# 复制返回的 token，在 https://jwt.io 解码
# 应该能看到 header 和 payload
```

### 3. 完整测试

```bash
# 测试 Next.js API
curl http://localhost:3000/api/connection-details \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"ticket": "tkt_e26dbdbb"}'
```

---

## 📞 需要帮助？

如果问题仍未解决，请提供：

1. 用户管理服务的代码（token 生成部分）
2. LiveKit 服务器的配置文件
3. LiveKit 服务器的日志

---

## 总结

**核心问题**：用户管理服务返回的 token 格式不正确

**推荐方案**：修复用户管理服务，使用 LiveKit SDK 正确生成 JWT

**临时方案**：不使用 ticket，直接启动（适合本地测试）

