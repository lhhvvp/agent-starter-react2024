# 前端对接：AI 消息交互与 HITL（UI Blocks v2）

本文是交给前端的对接规范，目标是让前端按统一协议完成：

1) AI 消息交互（点赞/点踩/点踩原因/复制/朗读…）的上报与幂等重试  
2) 交互聚合展示（计数 + 我的状态）  
3) HITL（例如 PlanConfirm）的 `tool.invoke → resume` 闭环  

后端已落地的事实源（SSOT）与回执（acks）都在本文描述范围内。

---

## 0. 你需要知道的核心原则

- **必须生成稳定的 `eventId` / `callId`**：同一次用户操作的重试必须复用同一个 id，否则后端无法做幂等去重。
- **所有写入最终都落 Journal SSOT**：前端只要遵循协议即可，不需要关心后端投影/数据库细节。
- **收到 ack 才算成功**：无论 LiveKit 还是 HTTP，前端都应以 ack/响应为准更新 UI，超时才重试。

---

## 1. 通道与 topic（LiveKit）

### 1.1 上行（前端 → 后端）

- topic：`lk.ui.events`
- payload：JSON 字符串，形如：
  - Message interactions：`{ "name": "msg.reaction.set", "args": { ... } }`
  - UI Blocks v2 / HITL：`{ "name": "tool.invoke", "args": { ... } }`

### 1.2 下行回执（后端 → 前端）

- topic：`lk.ui.acks`
- 两类 ack：
  - **Message Interaction ack**：`name="msg.interaction.ack"`
  - **UI Blocks/HITL ack**：`name="ui.ack"`

注意：后端会尽量定向回发给触发者；若运行时 SDK 不支持 destination，可能会广播。  
前端必须按 `eventId/callId/requestId` 做过滤与去重。

---

## 2. Message Interactions（点赞/点踩/复制/朗读）

### 2.1 事件上报：统一形态

topic：`lk.ui.events`

```json
{
  "name": "msg.reaction.set",
  "args": {
    "messageId": "msg_xxx",
    "eventId": "evt_xxx",
    "value": "up",
    "clientTsMs": 1700000000000,
    "llmCallId": "llmcall_xxx",
    "traceId": "trace_xxx"
  }
}
```

#### 2.1.1 支持的 `name`（MVP）

- `msg.reaction.set`
  - args：`messageId`, `eventId`, `value` = `up|down|none`
  - 可选：`reasonCode`, `text`
- `msg.feedback.create`（或 `msg.feedback.created`）
  - args：`messageId`, `eventId`, `reason_code`, `text?`, `span?`, `severity?`
- `msg.copy`
  - args：`messageId`, `eventId`, `scope?`, `length?`, `hasCode?`, `hasLinks?`
- `msg.read_aloud.start|stop|complete`
  - args：`messageId`, `eventId`, `engine?`, `voice?`, `lang?`, `duration_ms?`, `error_code?`

### 2.2 回执：`msg.interaction.ack`

topic：`lk.ui.acks`

```json
{
  "name": "msg.interaction.ack",
  "args": {
    "ok": true,
    "eventId": "evt_xxx",
    "messageId": "msg_xxx",
    "eventType": "reaction.set",
    "serverTsMs": 1700000000123,
    "ackId": "01K... (journal entry id)",
    "journalSeq": 456,
    "error_code": null,
    "error": null
  }
}
```

#### 2.2.1 `error_code` 与重试建议

- `ok:true`：成功持久化，停止重试
- `ok:false`：
  - `validation_failed` / `missing_message_id`：**不可重试**（修 payload / 上报埋点）
  - `journal_append_failed`：**可重试**（指数退避，复用同一个 `eventId`）

### 2.3 幂等与重试（前端必须实现）

推荐实现：

- 每次点击按钮生成一次 `eventId`（例如 `evt_${ulid()}`），在本次操作完成前都复用该 id。
- 若 `lk.ui.acks` 在 `T=800ms~1500ms` 内未收到：
  - 进行指数退避重试（200ms, 500ms, 1s, 2s，上限 5 次）
  - **每次重试必须复用同一个 `eventId`**
- 处理广播 ack：
  - 用 `eventId` 精确匹配自己 pending 队列
  - 同一个 `eventId` 的重复 ack 要忽略（只处理第一次）

---

## 3. 交互聚合展示（counts + my_reaction）

### 3.1 拉取消息历史 + interactions

HTTP：

- `GET /api/v1/conversations/{conversationId}/messages?include_interactions=true`
- 已登录（`Authorization: Bearer sess_xxx`）时，响应中每条消息会包含：
  - `interactions.reactions.up/down`
  - `interactions.feedback_count`
  - `interactions.my_reaction`（后端已自动绑定登录用户；无需传 actor_id）

前端 UI 推荐：

- 点赞按钮显示 `up_count`
- 点踩按钮显示 `down_count`
- 当前用户态（`my_reaction`）用于按钮高亮

### 3.2 UI 更新策略

- **乐观更新**：可在点击后先本地高亮/计数 +1，但必须在收到 `ack ok:true` 后最终确认；失败则回滚。
- 更稳妥策略（推荐）：点击后进入 `pending` 状态（loading），收到 `ack ok:true` 再更新高亮/计数；失败提示并保持原样。

---

## 4. HTTP 写入（非 LiveKit 场景 / 兜底）

当 UI 不走 LiveKit DataChannel（或作为兜底链路），可用：

### 4.1 设置 reaction

- `PUT /api/v1/conversations/{cid}/messages/{mid}/reaction`
- Header：`Authorization: Bearer sess_xxx`
- Body：

```json
{ "value": "up", "event_id": "evt_xxx", "client_ts_ms": 1700000000000 }
```

成功响应（示例）：

```json
{
  "ok": true,
  "event_id": "evt_xxx",
  "ack_id": "01K...",
  "journal_seq": 123,
  "server_ts_ms": 1700000000123,
  "interactions": { "reactions": { "up": 1, "down": 0 }, "feedback_count": 0, "my_reaction": "up" }
}
```

失败响应（示例）：HTTP 422/500，FastAPI 默认包一层 `detail`：

```json
{ "detail": { "ok": false, "error_code": "validation_failed", "error": "..." } }
```

### 4.2 创建 feedback

- `POST /api/v1/conversations/{cid}/messages/{mid}/feedback`
- Header：`Authorization: Bearer sess_xxx`
- Body：

```json
{ "reason_code": "inaccurate", "text": "原因说明（可选）", "event_id": "evt_xxx" }
```

---

## 5. HITL（UI Blocks v2）：PlanConfirm 的 `tool.invoke → resume` 闭环

你会在 UI Blocks v2 里遇到一种交互：后端发起一个“需要人确认/输入”的卡片（例如 plan_confirm），前端点击按钮后要让后端继续跑图（resume）。

### 5.1 关键字段：`requestId`

对于 HITL 卡片，后端会把 `requestId` 设置为：

```
interaction:<interaction_id>:<resolve_token>
```

- `interaction_id`：本次 HITL 的唯一 id
- `resolve_token`：签名 token（含过期），前端必须原样回传

### 5.2 前端上报：`tool.invoke`

topic：`lk.ui.events`

```json
{
  "name": "tool.invoke",
  "args": {
    "callId": "call_xxx",
    "requestId": "interaction:iact_xxx:v1....",
    "messageId": "msg_ui_blocks_xxx",
    "origin": { "blockId": "blk_xxx", "actionId": "workspace_plan_confirm.accept", "type": "actions" },
    "tool": { "name": "workspace_plan_confirm" },
    "arguments": {}
  }
}
```

其中：

- `origin.actionId` 用于描述具体按钮动作：
  - `workspace_plan_confirm.accept`
  - `workspace_plan_confirm.decline`
  - `workspace_plan_confirm.adjust`
- `callId` 必须稳定（同一次点击重试复用）

### 5.3 后端行为（你需要依赖这个语义）

后端将：

1) 校验 `requestId` 与 token  
2) 写入 SSOT：`interaction.resolved@1`  
3) 调用 `stream_resume()` 恢复 LangGraph（Talk 的 `interrupt()`）  
4) 下发 ack：`lk.ui.acks` → `ui.ack`

### 5.4 回执：`ui.ack`

topic：`lk.ui.acks`

```json
{
  "name": "ui.ack",
  "args": {
    "ok": true,
    "name": "tool.invoke",
    "requestId": "interaction:iact_xxx:v1....",
    "messageId": "msg_ui_blocks_xxx",
    "callId": "call_xxx",
    "ackId": "01K...",
    "journalSeq": 789,
    "serverTsMs": 1700000000456,
    "error_code": null,
    "error": null
  }
}
```

重试语义同上：

- `ok:true`：停止重试
- `ok:false`：
  - `invalid_token` / `invalid_token_binding` / `invalid_request_id`：不可重试
  - `journal_append_failed` / `resume_failed`：可重试（复用同一个 `callId` 和 `requestId`）

---

## 6. 前端实现建议（最小工程结构）

### 6.1 一个统一的发送器（建议）

- `sendUIEvent(event: {name, args})`：写 `lk.ui.events`
- `waitAck(predicate, timeoutMs)`：监听 `lk.ui.acks`，按 `eventId/callId/requestId` 匹配
- `retryWithBackoff(fn, shouldRetry)`：指数退避重试（复用稳定 id）

### 6.2 推荐埋点

至少对以下埋点：

- `ui.event.sent`（name, messageId, eventId/callId）
- `ui.ack.received`（ok, error_code, latencyMs）
- `ui.event.retry`（attempt, backoffMs）

---

## 7. 前端对接检查清单

- [ ] 发送 `lk.ui.events` 时，payload 必须是 JSON 字符串（不要混入自然语言）
- [ ] 每次交互都生成稳定 id（`eventId` 或 `callId`），重试复用
- [ ] 收到 `lk.ui.acks` 后更新 UI；广播场景按 id 过滤
- [ ] 拉取消息时加 `include_interactions=true` 并带登录态（Bearer sess_...），展示 `my_reaction`
- [ ] HITL：`tool.invoke` 必须原样回传 `requestId`（包含 resolve_token）

---

## 8. 相关后端实现位置（便于联调定位）

- Message interactions 入口（LiveKit）：`python_packages/livekit_agent_per_light_lane/src/livekit_agent_per_light_lane/apps/livekit_gateway/handlers.py`
- `tool.invoke` HITL 入口（LiveKit）：同上（`name == "tool.invoke"` 分支）
- 会话历史（含 interactions）：`python_packages/livekit_agent/src/livekit_agent/api/conversation_router.py`
- Message interaction SSOT schema：`python_packages/livekit_contracts/src/livekit_contracts/assets/schemas/events/msg.interaction.committed@1.json`
- Interaction resolved SSOT schema：`python_packages/livekit_contracts/src/livekit_contracts/assets/schemas/events/interaction.resolved@1.json`

