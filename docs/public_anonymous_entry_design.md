# 免登录（匿名）接入 AI 客服：前端设计与实现

目标：让「市民」无需登录即可进入医保智能 AI 客服；同时保留「工作人员登录」与「票据 ticket 入口」能力，形成统一、可演进的入口体系。

> 备注：本仓库原先入口 `/` 强制登录；本实现改为 **同一路径自适应**：
> - 已登录：进入 `me` 模式（我的会话/项目/工作区）
> - 未登录：进入 `public` 模式（免登录咨询）

---

## 1. 入口与路由

- `/`（自适应入口）
  - 服务端调用 `/api/auth/session` 校验 cookie
  - `200` → 渲染 `mode="me"`
  - 非 `200` / 异常 → 渲染 `mode="public"`
- `/tickets`（兼容入口）
  - 保留原有 ticket 模式（可选填 ticket）
- `/login`（工作人员登录）
- `/privacy`、`/terms`（公众入口合规提示）

核心改动文件：
- `app/(app)/page.tsx`：入口模式判定（me/public）
- `components/app.tsx`：新增 `public` 模式
- `components/welcome.tsx`：新增公众入口 UI（品牌、免责声明、快捷意图、同意勾选）

---

## 2. 匿名会话连接（LiveKit Token 发放）

### 2.1 公众入口（免登录）

前端在点击「开始咨询」时触发连接参数获取：
- `GET /api/connection-details?display_name=...`

服务端（Next.js Route Handler）签发 LiveKit token：
- `app/api/connection-details/route.ts`
  - `display_name` 仅用于 UI 命名（做了裁剪与换行清理）
  - `identity` 采用随机 `voice_assistant_guest_XXXX`，避免在 identity 中承载个人信息

### 2.2 ticket 入口（外部系统集成）

若用户从短信/公众号/业务系统获得 ticket：
- `POST /api/connection-details` `{ ticket, profile? }`
- 由上游用户管理服务消费 ticket 后返回 `{ token,url,room,conv_id,metadata }`

---

## 3. 体验设计（面向市民）

公众入口 Welcome 具备：
- 机构品牌 Logo + 标题「医保智能 AI 客服」
- 可选「称呼」输入（提示不要填写身份证/手机号等敏感信息）
- 快捷意图 chips（点击后作为首条消息自动发送）
- 「隐私声明/服务条款」同意勾选（未勾选不可开始）
- 明确紧急提示：120/110
- 明确工作人员入口：`/login`

---

## 4. 工程策略（高并发/可演进）

- `useConnectionDetails({ autoFetch:false })`：避免页面加载即生成房间/token，减少无效签发与后端压力
- 连接参数在「开始咨询」时才获取（更符合真实流量）
- token 仍保持短 TTL（当前为 15m），建议后续配合：
  - 服务端频控（IP/指纹）
  - 自动续签/重连策略
  - 统一的匿名会话归档（需要后端支持 conv_id）

---

## 5. 下一步（建议）

若需要把「匿名会话」纳入统一的会话/工单/归档体系，建议后端增加：
- `POST /api/v1/public/conversations`：创建匿名会话 + 返回 rtc token（或返回 ticket）
- 或 `POST /api/v1/tickets`：签发一次性 ticket（匿名）后沿用现有 consume 机制

前端即可在 `public` 模式优先走上游，降级到本地 `GET /api/connection-details`。

