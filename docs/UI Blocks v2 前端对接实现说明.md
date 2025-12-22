# UI Blocks v2 前端对接实现说明（Implementation Guide）

面向：前端工程师 / 全栈工程师（配合《UI Blocks v2 后端对接规范》）

本说明记录本项目对 UI Blocks v2 在前端的落地实现，明确代码位置、对接方式、运行时约束与扩展点，提升项目的可控性与可演进性。

## 目标与范围
- 统一通道：使用 LiveKit Chat 的 `channelTopic` 承载 UI Blocks（下行）与 UI Events（上行）。
- 明确契约：所有载荷均以 JSON 文本传输，强约束 `content-type` 与 `version`。
- 严格模式：以 Schema-First 设计和最小运行时校验守护边界，渲染层不直接处理未校验数据。
- 可观测性：以 `requestId/messageId/callId` 三元组贯穿端到端链路，便于排查和回放。
- 易扩展：按 Block.type 分治渲染，组件解耦，支持无痛扩展新类型与新能力。

## 依赖与版本
- LiveKit 前端：`@livekit/components-react`（锁定 2.x）
- LiveKit 客户端：`livekit-client`（2.x）
- Next.js App Router（现有项目结构）

## 代码落地（文件与职责）
- 常量与最小类型：`lib/ui-blocks/index.ts:1`
  - 定义 `LK_UI_BLOCKS_TOPIC`、`LK_UI_EVENTS_TOPIC`、`LK_UI_BLOCKS_CONTENT_TYPE`、`LK_UI_BLOCKS_VERSION`
  - 定义最小 `UIPayload`/`UIBlock`/`ToolAction` 等类型，供 Hook 与渲染层使用
- JSON Schema（可用于运行时/AJV 校验或类型生成）
  - `lib/ui-blocks/schema/ui-blocks.v2.json:1`
  - `lib/ui-blocks/schema/ui-events.v2.json:1`
- 通道封装 Hook（下行 UI）：`hooks/useUIBlocksChannel.ts:1`
  - 订阅下行：同时通过 TextStream 与 Chat 侦听 `lk.ui.blocks`，解析为 `UIPayload`
  - 发送上行：通过 `useChat().send(..., { topic: 'lk.ui.events', attributes })` 发送事件（见下）
  - 最小校验：`schema/content-type/version`；可注入 `validate(payload)` 进行 AJV 强校验
- 通道封装 Hook（下行事件）：`hooks/useUIEventsChannel.ts:1`
  - 订阅下行：同时通过 TextStream 与 Chat 侦听 `lk.ui.events`
  - 聚合状态：按 `callId` 汇总 `tool.invoke/result/error/cancel` 的进度、终态与错误
  - 片段渲染：将 `tool.result(final:true).ui` 的“轻量 UI 片段”规范化为 `UIPayload`，复用 UI Blocks 渲染器
- 早期挂载：`components/ui-blocks/Bootstrap.tsx:1`
  - 在会话视图加载时即调用 `useUIBlocksChannel()` 与 `useUIEventsChannel()`，保证 TextStream/Chat 处理器提前注册，避免“无 handler 被忽略”
  - 注意：LiveKit TextStream 的同一 `topic` 仅允许注册一个 handler。请只在 Bootstrap 等全局常驻组件内注册监听，其他页面组件从共享运行时读取数据，避免重复注册导致报错（"has already been set"）。
- 后端令牌/房间发放：`app/api/connection-details/route.ts:1`
  - LiveKit Server SDK 生成房间与 Token，供前端连接

## 通道与消息（契约）
- 下行（后端 → 前端）
  - topic：`lk.ui.blocks`
  - attributes：`content-type=application/vnd.ui-blocks+json`，`version=2`
  - payload：`UIPayload`（`schema:"ui-blocks@2"`、稳定 id、additionalProperties:false）
- 上行（前端 → 后端）
  - topic：`lk.ui.events`
  - payload：`UIEvent`（`tool.invoke/cancel/result/error/ui.rendered/ui.error`）
- 定向发送建议：后端优先使用 destinationIdentities/destinationSids，避免仅依赖 attributes 过滤

## 使用方式（最小示例）
- 订阅 UI Blocks、发送 UI Events：
  ```tsx
  import { useUIBlocksChannel } from '@/hooks/useUIBlocksChannel';

  export function UIBlocksContainer() {
    // 示例仅展示 API；实际项目中推荐在 Bootstrap 中注册监听，
    // 页面组件通过运行时（hooks/useUIBlocksRuntime.ts）读取数据。
    const { uiMessages, sendUIEvent } = useUIBlocksChannel();

    // 取最新一条 UI 消息
    const latest = uiMessages.at(-1)?.payload;

    // 示例：点击后发送 tool.invoke
    const onClick = () => {
      if (!latest) return;
      void sendUIEvent({
        name: 'tool.invoke',
        args: {
          callId: 'call_' + Date.now(),
          requestId: latest.requestId,
          messageId: latest.messageId,
          origin: { blockId: 'btn.demo', type: 'button' },
          tool: { name: 'demo_action' },
          arguments: {},
        },
      });
    };

    return (
      <div>
        <button onClick={onClick}>Invoke Demo Tool</button>
      </div>
    );
  }
  ```

- 接收 UI Events 与进度/错误/片段渲染：
  ```tsx
  import { useUIEventsChannel } from '@/hooks/useUIEventsChannel';

  export function ToolActivityPanel() {
    const { orderedCalls } = useUIEventsChannel();
    return (
      <ul>
        {orderedCalls.map((c) => (
          <li key={c.callId}>
            {c.tool?.name ?? '调用'} — {c.callId}
            {c.error ? ` · 错误：${c.error.code}` : c.final ? ' · 完成' : ` · 进度：${Math.round((c.progress ?? 0) * 100)}%`}
          </li>
        ))}
      </ul>
    );
  }
  ```

- 合流渲染（Workspace）：`components/ui-blocks/WorkspaceContent.tsx:1`
  - 通过运行时（`lib/ui-blocks/runtime.ts` + `hooks/useUIBlocksRuntime.ts`）读取：
    - UI Blocks 列表（来自 `lk.ui.blocks`）
    - 事件片段 `uiSnippets`（来自 `tool.result.ui`）
    - 调用状态 `orderedCalls`
  - 将 `snippets` 与 `blocks` 合并（按 `messageId` 去重），统一用 `BlockRenderer` 渲染
  - 辅以一个“工具调用”面板展示 `orderedCalls` 的进度/错误/终态

- 渲染层建议：建立 `components/livekit/ui-blocks/*`，按 `Block.type` 分文件，组合渲染；组件只接收已校验数据与 `sendUIEvent`。

## 校验与可控性
- 运行时最小校验：`hooks/useUIBlocksChannel.ts:1` 已校验 `schema/content-type/version`，不合规消息将被忽略。
- 强校验（推荐）：使用 AJV 对 `ui-blocks.v2.json` 与 `ui-events.v2.json` 做双向校验，在 Hook 内注入 `validate` 回调，渲染层仅消费通过校验的数据。
- 失败处理：
  - 解析失败/校验失败：前端不渲染该消息，必要时发送 `ui.error`（含 `requestId/messageId`）。
  - 工具调用：每个 `callId` 必须进入终态（`tool.result(final:true)` 或 `tool.error`）。前端可设置调用超时与取消策略。
 - 早期注册：通过 `UIBlocksBootstrap` 在页面初始化即注册 TextStream/Chat 处理器，避免“ignoring incoming text stream…”

## 观测与追踪
- 建议统一记录三元组：`requestId`/`messageId`/`callId`。
- 关键时机：收到下行、发起工具调用、收到进度片段、收到最终结果/错误、渲染完成或失败（`ui.rendered/ui.error`）。

## 配置与开关
- 环境变量：参考 `app/api/connection-details/route.ts:1` 的 `LIVEKIT_URL/LIVEKIT_API_KEY/LIVEKIT_API_SECRET`。
- Feature Flags（建议）：
  - `UIBLOCKS_VALIDATE_STRICT`：启用 AJV 严格校验
  - `UIBLOCKS_RENDER_UNSAFE_MD`：允许扩展 Markdown 语法（默认关闭，白名单渲染）

## 扩展与演进
- 新增 Block 类型：在 `lib/ui-blocks/index.ts:1` 增加类型，在 Schema 中新增 $defs 与 oneOf；渲染层对应新增组件。
- 切换 DataChannel：对高吞吐/二进制场景，可迁移至 `useDataChannel(topic)`，消息结构与语义保持一致。
- 增量/流式：后续可引入 `ui.patch/stream`（建议 2.1+ 版本），并在 Schema/Hook 中扩展。
 - 最佳实践：
   - 持久 UI 用 `lk.ui.blocks` 作为“单一事实源”，便于回放与去重
   - 事件 `lk.ui.events` 负责进度/错误与轻量片段（需要时转为 `UIPayload` 进入同一渲染管线）

## 命名与约定（“vibing code” 实践）
- 稳定 ID：`^[A-Za-z0-9._-]{1,128}$`，语义化命名（如 `card.loan`、`act.submit`）。
- 单一职责：
  - Hook 只处理订阅/发送与边界校验；
  - 渲染组件只处理 UI 表达与交互；
  - 校验逻辑集中在 Hook 层，通过可插拔策略增强。
- Schema First：以 Schema 驱动输入输出定义与渲染行为（min/max/required/pattern 自动作用于表单）。
- Fail-Fast：属性/版本不匹配直接忽略并可上报 `ui.error`，避免脏数据进入渲染。
- 可回滚：版本字段必须与 `schema:"ui-blocks@2"` 一致；未来破坏性更新通过 `schema`/`version` 双位控制灰度。

## 测试建议
- 单测：
  - Hook 解析与过滤：合法/非法/不匹配版本/错误 JSON
  - 事件发送：`tool.invoke/cancel/result/error` 序列完整性
- 端到端：模拟后端推送 UI Blocks，验证渲染与事件回传链路。

## 迁移与发布
- 迁移：老版本消息需统一升级为 `schema:"ui-blocks@2"`；前端忽略旧字段（如旧 `ToolAction.schema`）。
- 发布：建议以语义化版本为界，配套更新 Schema 与渲染组件；保持回滚路径清晰。

## 常见问题（FAQ）
- 为什么用 Chat 而非 DataChannel？
  - Chat 提供 `channelTopic` 与 `attributes`，与文本 JSON 消息契合；需要高吞吐/二进制时可切换至 DataChannel。
- attributes 必填吗？
  - 建议必填，以保证前端快速过滤；前端已做最小校验。
- 如何做表单自动校验？
  - 在 `ToolAction.argumentsSchema` 提供 JSON Schema，前端据此生成/增强表单约束（min/max/required/pattern）。

---

若需要，我可以：
- 接入 AJV 并提供默认严格校验器；
- 搭建 `components/livekit/ui-blocks/*` 的基础渲染层；
- 在现有页面（如 `app/components/livekit/page.tsx:1`）集成一个端到端示例。
