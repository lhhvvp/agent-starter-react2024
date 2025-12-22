UI Blocks v2 后端对接规范（开发版 · 结构化输出加强版）

面向：后端工程师（LiveKit Agents / 自建后端）与前端工程师

本规范定义 UI Blocks v2 的传输、数据结构与事件语义，并强化“严格结构化输出 / 函数调用”的约束：

以 JSON Schema 2020-12 约束输入与输出；

所有副作用/逻辑调用一律通过工具语义（function/tool calling）；

双向运行时校验（additionalProperties:false）；

稳定 ID、可寻址（Block/字段/行均具稳定 id）；

端到端可观测（requestId/messageId/callId 三元组）。

注：本版本为开发基线，不考虑对 v1 的兼容；前端/后端需同时升级。

0. 与 LiveKit 前端对齐（组件与通道）

- 前端库：@livekit/components-react（本仓库锁定 2.x），配套 livekit-client 2.x。
- 通道：使用 Chat 的 topic 区分业务通道；推荐：
  - 下行（后端 → 前端）：`lk.ui.blocks`
  - 上行（前端 → 后端）：`lk.ui.events`
- 消息属性：利用 Chat Message `attributes: Record<string,string>` 标注元信息：
  - `content-type: application/vnd.ui-blocks+json`
  - `version: "2"`
- 代码接入（已提供最小实现）：
  - Hook：`hooks/useUIBlocksChannel.ts:1` 暴露 `uiMessages`（解析后的 UIPayload）与 `sendUIEvent(event)`；内部通过 `useChat({ channelTopic: 'lk.ui.blocks' })` 订阅消息，通过 `send(..., { topic: 'lk.ui.events', attributes })` 上报事件；
  - 常量与类型：`lib/ui-blocks/index.ts:1` 定义通道/Content-Type/Version 常量与最小 TypeScript 类型；
  - Schema：`lib/ui-blocks/schema/ui-blocks.v2.json:1`、`lib/ui-blocks/schema/ui-events.v2.json:1`（可用于运行时校验或生成类型）。

说明：上述实现严格遵循 LiveKit Components 的 Chat/topic 能力与消息 attributes 字段，并与下文规范字段一致。

1. 传输与主题
1.1 下行（后端 → 前端）

SDK 调用（示例）：

Python: room.local_participant.send_text(...)

Web: room.localParticipant.sendText(...)

topic: lk.ui.blocks（建议使用服务端 SDK 的定向发送能力：destinationIdentities/destinationSids；不要仅依赖 attributes 进行客户端过滤）

text: UIPayload 的 JSON 字符串

attributes（Chat Message Attributes）：

content-type: application/vnd.ui-blocks+json

version: "2"（必须与 schema:"ui-blocks@2" 一致）

requestId: 端到端排查用（与载荷内字段一致）

destination_identities（可选）：如需定向回复触发者，设置为 [participant_identity]

1.2 上行（前端 → 后端）

Web: room.localParticipant.sendText(...)

topic: lk.ui.events

text: 事件 JSON，如 { "name": "tool.invoke", "args": { ... } }

说明：大载荷与增量更新将在 v2.1 定义 ui.patch/stream。v2 仅定义全量渲染。

2. 顶层载荷（UIPayload）
{
  "schema": "ui-blocks@2",          // 固定值，必填
  "requestId": "req_...",           // 必填，端到端链路ID
  "messageId": "msg_...",           // 必填，本条 UI 消息ID（用于事件回传关联）
  "lang": "zh-CN",                  // 可选，BCP-47
  "text": "可选说明或提示",          // 可选
  "blocks": [ /* Block[] */ ]       // 必填
}


要求

schema/requestId/messageId/blocks 必填；

禁止未定义字段：所有对象均 additionalProperties:false；

所有 Block/子元素（表单字段/表格列与行/kv 项）均需稳定唯一 id，正则 ^[A-Za-z0-9._-]{1,128}$；

attributes.version 必须与 schema:"ui-blocks@2" 一致，否则前端拒收并上报 ui.error。后端推荐直接生成正确 attributes；前端已在 `hooks/useUIBlocksChannel.ts:1` 做到最小校验与忽略。

3. Block 类型（v2）
3.1 基础属性（所有 Block 共有）
{ "id": string, "type": string, "state?": { "loading?": boolean, "disabled?": boolean, "reason?": string } }

3.2 文本 text
{ "id": "...", "type": "text", "content": "string", "variant?": "muted|body|title|subtitle", "format?": "plain|md" }


md 采取严格白名单渲染；禁止原生 HTML/脚本/内联样式注入。

3.3 键值 kv
{ "id":"...", "type":"kv", "items":[ { "id":"...","key":"...","value":"...","copyable?":true } ] }

3.4 表格 table
{
  "id":"...", "type":"table",
  "columns":[ { "id":"col1","label":"...","align?":"left|center|right","width?":120 } ],
  "rows":[ { "id":"r1","cells": { "col1": "任意JSON" } } ]
}


cells 的键 必须与 columns[*].id 对齐；值允许任意 JSON（前端可按业务类型渲染）。

3.5 卡片 card
{
  "id":"...", "type":"card",
  "title?":"...", "subtitle?":"...",
  "body":[ /* Block[] 可嵌套 */ ]
}

3.6 按钮组 actions
{
  "id":"...", "type":"actions",
  "items":[ { "id":"...","label":"...","style?":"primary|secondary|danger","action": ToolAction } ]
}

3.7 表单 form
{
  "id":"...", "type":"form", "title?":"...",
  "fields":[ FormField, ... ],
  "submit": { "label?":"提交", "action": ToolAction } // 提交=tool.invoke
}


FormField（按输入类型约束）

{
  "id":"字段ID", "label":"标签", "input":"text|number|textarea|select|tel|email|password|date",
  "required":true,
  "options":[ { "id":"opt1", "label":"选项1" } ], // 仅 select 使用
  "placeholder":"占位提示",
  "defaultValue": "与 input 匹配的类型",
  "min": 0, "max": 100, "step": 1, "maxLength": 140, // 仅在 number/textarea 生效（见 Schema）
  "pattern": "^.+$", "hint":"提示", "errorMessage":"校验失败提示",
  "sensitive": false, "redact": false, "maskOnClient": false,
  "readonly": false, "disabled": false
}


详见第 5 章 JSON Schema：已用 if/then 约束 number/date/email/tel 的专属校验。

3.8 单按钮 button
{ "id":"...", "type":"button", "text":"...", "action": ToolAction }

4. 工具语义与严格结构化输出（对齐主流 Function Calling）

目标：任何副作用或业务逻辑调用都以工具调用完成；输入与输出均由 JSON Schema 约束，并在前后端双向校验。

4.1 ToolAction（前端可用于自动表单与输入校验）
{
  "type": "tool",
  "name": "calculate_loan",
  "arguments": { /* 可选：静态入参 */ },

  // —— 严格结构化：入参 Schema（二选一：内联或引用） ——
  "argumentsSchema": { "$schema":"https://json-schema.org/draft/2020-12/schema", "$id":"urn:tool:calculate_loan:args", "type":"object", ... },
  "argumentsSchemaRef": "urn:tool:calculate_loan:args",

  // —— 严格结构化：输出 Schema（建议提供，便于前端校验/渲染） ——
  "resultSchema": { "$schema":"https://json-schema.org/draft/2020-12/schema", "$id":"urn:tool:calculate_loan:result", "type":"object", ... },
  "resultSchemaRef": "urn:tool:calculate_loan:result"
}


约束

若同时提供 argumentsSchema 与 argumentsSchemaRef，以内联为准；否则任选其一；

前端在触发前用 argumentsSchema 校验表单/默认值；后端在接收时再次校验；

工具返回最终结果时，若提供 resultSchema，后端需保证输出满足该 Schema，前端可做二次校验并自动渲染（如 kv/table）。

建议：在 form 提交按钮所对应的 ToolAction 提供 argumentsSchema，前端可自动生成/增强表单（自动 min/max/required/pattern 校验），避免参数与表单重复维护。

4.2 事件：触发 / 取消 / 结果 / 错误
4.2.1 触发（前端 → 后端）
{
  "name": "tool.invoke",
  "args": {
    "callId": "call_...",           // 必填：本次调用ID，唯一
    "requestId": "req_...",         // 必填：与 UI 消息一致
    "messageId": "msg_...",         // 必填：与 UI 消息一致
    "origin": { "blockId": "...", "actionId":"...", "type":"actions|button|form" },
    "tool": {
      "name": "calculate_loan",
      "argumentsSchemaRef": "urn:tool:calculate_loan:args",   // 可选：与 ToolAction 保持一致
      "resultSchemaRef": "urn:tool:calculate_loan:result"     // 可选
    },
    "arguments": { /* 与 argumentsSchema 对齐的对象（可为空 {}） */ }
  }
}

4.2.2 取消（前端 → 后端）
{ "name": "tool.cancel", "args": { "callId": "call_...", "reason?": "..." } }


后端收到取消后必须给终态响应：

tool.error(code:"CANCELLED")，或

tool.result(final:true, content:{ "cancelled": true })

4.2.3 结果（后端 → 前端）

过程片段（可多次）：

{ "name":"tool.result", "args": { "callId":"...", "final":false, "progress":0.3, "content": { "text":"处理中..." } } }


最终结果（一次）：

{
 "name":"tool.result",
  "args":{
    "callId":"...",
    "final":true,
    // —— 结构化输出：与 resultSchema 对齐 —— 
    "output": { "maxAmount": 260000, "annualRate": 0.031, "explain":"..." },
    // 可选：若与 ToolAction 提供的 schema 不同，可明确声明引用
    "outputSchemaRef": "urn:tool:calculate_loan:result",

    // —— 可附带要直接渲染的 UI（轻量片段） —— 
    // 仅包含 { text?, lang?, blocks }，不要嵌入完整 UIPayload（无 schema/requestId/messageId）
    "ui": { "text":"测算完成", "blocks":[ /* Block[] */ ] }
  }
}


约束

每个 callId 必须进入终态：最终收到一次 tool.result(final:true) 或一次 tool.error；

progress 若出现，单调递增且 0..1；

若提供 output，后端必须保证其通过 resultSchema 校验。前端校验失败应当 ui.error 并忽略该 output 的渲染。

补充建议（与前端实现对齐）：
- `lk.ui.events` 建议同样携带 Chat attributes：`content-type: application/vnd.ui-blocks+json`、`version: "2"`，便于前端统一过滤与诊断。
- 为了持久化/幂等渲染，最终结果建议同时下发一条完整 `UIPayload` 至 `lk.ui.blocks`；`tool.result.ui` 作为轻量即时反馈可选提供。

4.2.4 错误（后端 → 前端）
{
  "name":"tool.error",
  "args": {
    "callId":"...", "code":"INVALID_ARGS|UNAUTHORIZED|FORBIDDEN|NOT_FOUND|CONFLICT|PRECONDITION_FAILED|RATE_LIMITED|BACKEND_UNAVAILABLE|TIMEOUT|CANCELLED|INTERNAL",
    "message":"人类可读错误", "retriable": false
  }
}

4.2.5 渲染回执（前端 → 后端，可选）
{ "name":"ui.rendered", "args": { "requestId":"...", "messageId":"..." } }
{ "name":"ui.error",    "args": { "requestId":"...", "messageId":"...", "code":"RENDER_FAIL", "message":"..." } }

5. JSON Schema（UI Blocks v2）

文件位置（已创建）：`lib/ui-blocks/schema/ui-blocks.v2.json:1`
修正点：为 ToolAction 增加 argumentsSchema/argumentsSchemaRef/resultSchema/resultSchemaRef；为 FormField 增加类型依赖校验（number/date/tel/email）。

{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:lk:ui-blocks.v2",
  "title": "UI Blocks v2",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema", "requestId", "messageId", "blocks"],
  "properties": {
    "schema": { "type": "string", "const": "ui-blocks@2" },
    "requestId": { "type": "string", "minLength": 1 },
    "messageId": { "type": "string", "minLength": 1 },
    "lang": { "type": "string" },
    "text": { "type": "string" },
    "blocks": { "type": "array", "items": { "$ref": "#/$defs/Block" } }
  },
  "$defs": {
    "Id": { "type": "string", "pattern": "^[A-Za-z0-9._-]{1,128}$" },
    "BlockState": {
      "type": "object", "additionalProperties": false,
      "properties": { "loading": { "type": "boolean" }, "disabled": { "type": "boolean" }, "reason": { "type": "string" } }
    },
    "ToolAction": {
      "type": "object",
      "additionalProperties": false,
      "required": ["type", "name"],
      "properties": {
        "type": { "type": "string", "const": "tool" },
        "name": { "type": "string", "minLength": 1 },
        "arguments": { "type": "object" },

        "argumentsSchema": { "type": "object" },
        "argumentsSchemaRef": { "type": "string", "minLength": 1 },

        "resultSchema": { "type": "object" },
        "resultSchemaRef": { "type": "string", "minLength": 1 }
      }
    },
    "ActionItem": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "label", "action"],
      "properties": {
        "id": { "$ref": "#/$defs/Id" },
        "label": { "type": "string" },
        "style": { "type": "string", "enum": ["primary", "secondary", "danger"] },
        "action": { "$ref": "#/$defs/ToolAction" }
      }
    },
    "BaseBlock": {
      "type": "object", "additionalProperties": false, "required": ["id", "type"],
      "properties": { "id": { "$ref": "#/$defs/Id" }, "type": { "type": "string" }, "state": { "$ref": "#/$defs/BlockState" } }
    },
    "TextBlock": {
      "allOf": [
        { "$ref": "#/$defs/BaseBlock" },
        { "type": "object", "additionalProperties": false, "required": ["type", "content"],
          "properties": {
            "type": { "const": "text" }, "content": { "type": "string" },
            "variant": { "type": "string", "enum": ["muted", "body", "title", "subtitle"] },
            "format": { "type": "string", "enum": ["plain", "md"] }
          }
        }
      ]
    },
    "KVItem": {
      "type": "object", "additionalProperties": false, "required": ["id", "key", "value"],
      "properties": { "id": { "$ref": "#/$defs/Id" }, "key": { "type": "string" }, "value": { "type": "string" }, "copyable": { "type": "boolean" } }
    },
    "KVBlock": {
      "allOf": [
        { "$ref": "#/$defs/BaseBlock" },
        { "type": "object", "additionalProperties": false, "required": ["type", "items"],
          "properties": { "type": { "const": "kv" }, "items": { "type": "array", "items": { "$ref": "#/$defs/KVItem" } } }
        }
      ]
    },
    "TableColumn": {
      "type": "object", "additionalProperties": false, "required": ["id", "label"],
      "properties": { "id": { "$ref": "#/$defs/Id" }, "label": { "type": "string" }, "align": { "type": "string", "enum": ["left","center","right"] }, "width": { "type": "number" } }
    },
    "TableRow": {
      "type": "object", "additionalProperties": false, "required": ["id", "cells"],
      "properties": {
        "id": { "$ref": "#/$defs/Id" },
        "cells": { "type": "object", "additionalProperties": true, "propertyNames": { "pattern": "^[A-Za-z0-9._-]{1,128}$" } }
      }
    },
    "TableBlock": {
      "allOf": [
        { "$ref": "#/$defs/BaseBlock" },
        { "type": "object", "additionalProperties": false, "required": ["type","columns","rows"],
          "properties": {
            "type": { "const": "table" },
            "columns": { "type":"array","items":{ "$ref":"#/$defs/TableColumn" }, "minItems":1 },
            "rows": { "type":"array","items":{ "$ref":"#/$defs/TableRow" } }
          }
        }
      ]
    },
    "CardBlock": {
      "allOf": [
        { "$ref": "#/$defs/BaseBlock" },
        { "type": "object", "additionalProperties": false, "required": ["type", "body"],
          "properties": { "type": { "const": "card" }, "title": { "type":"string" }, "subtitle": { "type":"string" }, "body": { "type":"array", "items": { "$ref":"#/$defs/Block" } } }
        }
      ]
    },
    "ActionsBlock": {
      "allOf": [
        { "$ref":"#/$defs/BaseBlock" },
        { "type": "object", "additionalProperties": false, "required": ["type","items"],
          "properties": { "type": { "const":"actions" }, "items": { "type":"array","items":{ "$ref":"#/$defs/ActionItem" }, "minItems":1 } }
        }
      ]
    },
    "SelectOption": {
      "type":"object", "additionalProperties": false, "required":["id","label"],
      "properties": { "id": { "$ref":"#/$defs/Id" }, "label": { "type":"string" } }
    },
    "FormField": {
      "type":"object", "additionalProperties": false, "required": ["id","label","input"],
      "properties": {
        "id": { "$ref":"#/$defs/Id" },
        "label": { "type":"string" },
        "input": { "type":"string", "enum":["text","number","textarea","select","tel","email","password","date"] },
        "required": { "type":"boolean" },
        "options": { "type":"array", "items": { "$ref":"#/$defs/SelectOption" } },
        "placeholder": { "type":"string" },
        "defaultValue": {},
        "min": { "type":"number" }, "max": { "type":"number" }, "step": { "type":"number" },
        "maxLength": { "type":"integer", "minimum": 0 },
        "pattern": { "type":"string" },
        "hint": { "type":"string" }, "errorMessage": { "type":"string" },
        "sensitive": { "type":"boolean" }, "redact": { "type":"boolean" }, "maskOnClient": { "type":"boolean" },
        "readonly": { "type":"boolean" }, "disabled": { "type":"boolean" }
      },
      "allOf": [
        {
          "if": { "properties": { "input": { "const": "number" } } },
          "then": {
            "properties": {
              "defaultValue": { "type":"number" },
              "min": { "type":"number" }, "max": { "type":"number" }, "step": { "type":"number" }
            }
          }
        },
        {
          "if": { "properties": { "input": { "const": "date" } } },
          "then": {
            "properties": {
              "defaultValue": { "type":"string", "pattern":"^\\d{4}-\\d{2}-\\d{2}$" }
            }
          }
        },
        {
          "if": { "properties": { "input": { "const": "email" } } },
          "then": { "properties": { "pattern": { "type":"string" } } }
        },
        {
          "if": { "properties": { "input": { "const": "tel" } } },
          "then": { "properties": { "pattern": { "type":"string" } } }
        }
      ]
    },
    "FormBlock": {
      "allOf": [
        { "$ref":"#/$defs/BaseBlock" },
        { "type":"object", "additionalProperties": false, "required":["type","fields","submit"],
          "properties": {
            "type": { "const":"form" },
            "title": { "type":"string" },
            "fields": { "type":"array","items":{ "$ref":"#/$defs/FormField" }, "minItems":1 },
            "submit": {
              "type":"object", "additionalProperties": false, "required":["action"],
              "properties": { "label": { "type":"string" }, "action": { "$ref":"#/$defs/ToolAction" } }
            }
          }
        }
      ]
    },
    "ButtonBlock": {
      "allOf": [
        { "$ref":"#/$defs/BaseBlock" },
        { "type":"object", "additionalProperties": false, "required":["type","text","action"],
          "properties": { "type": { "const":"button" }, "text": { "type":"string" }, "action": { "$ref":"#/$defs/ToolAction" } }
        }
      ]
    },
    "Block": {
      "oneOf": [
        { "$ref":"#/$defs/TextBlock" },
        { "$ref":"#/$defs/KVBlock" },
        { "$ref":"#/$defs/TableBlock" },
        { "$ref":"#/$defs/CardBlock" },
        { "$ref":"#/$defs/ActionsBlock" },
        { "$ref":"#/$defs/FormBlock" },
        { "$ref":"#/$defs/ButtonBlock" }
      ]
    }
  }
}

6. JSON Schema（UI Events v2）

文件位置（已创建）：`lib/ui-blocks/schema/ui-events.v2.json:1`
修正点：

$id/$ref 统一使用 urn:lk:*，避免示例域名；

tool.invoke 的 tool 支持 argumentsSchemaRef/resultSchemaRef；

tool.result 新增 output/outputSchemaRef；

tool.error.code 给出枚举；

ui.ui.blocks 的 $ref 指向 urn:lk:ui-blocks.v2#/$defs/Block（此前示例的 $ref 域名容易解析失败）。

{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:lk:ui-events.v2",
  "title": "UI Events v2",
  "type": "object",
  "additionalProperties": false,
  "required": ["name", "args"],
  "properties": {
    "name": { "type": "string" },
    "args": { "type": "object" }
  },
  "oneOf": [
    {
      "properties": {
        "name": { "const": "tool.invoke" },
        "args": {
          "type": "object",
          "additionalProperties": false,
          "required": ["callId", "requestId", "messageId", "origin", "tool", "arguments"],
          "properties": {
            "callId": { "type": "string", "minLength": 1 },
            "requestId": { "type": "string", "minLength": 1 },
            "messageId": { "type": "string", "minLength": 1 },
            "origin": {
              "type": "object", "additionalProperties": false,
              "required": ["blockId", "type"],
              "properties": {
                "blockId": { "type": "string", "minLength": 1 },
                "actionId": { "type": "string" },
                "type": { "type": "string", "enum": ["actions", "button", "form"] }
              }
            },
            "tool": {
              "type": "object", "additionalProperties": false,
              "required": ["name"],
              "properties": {
                "name": { "type": "string", "minLength": 1 },
                "argumentsSchemaRef": { "type": "string" },
                "resultSchemaRef": { "type": "string" }
              }
            },
            "arguments": { "type": "object" }
          }
        }
      }
    },
    {
      "properties": {
        "name": { "const": "tool.cancel" },
        "args": {
          "type": "object", "additionalProperties": false,
          "required": ["callId"],
          "properties": { "callId": { "type": "string", "minLength": 1 }, "reason": { "type": "string" } }
        }
      }
    },
    {
      "properties": {
        "name": { "const": "tool.result" },
        "args": {
          "type": "object",
          "additionalProperties": false,
          "required": ["callId", "final"],
          "properties": {
            "callId": { "type": "string", "minLength": 1 },
            "final": { "type": "boolean" },
            "progress": { "type": "number", "minimum": 0, "maximum": 1 },
            "content": { "type": "object" },

            "output": { "type": "object" },
            "outputSchemaRef": { "type": "string" },

            "ui": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "text": { "type": "string" },
                "lang": { "type": "string" },
                "blocks": { "type": "array", "items": { "$ref": "urn:lk:ui-blocks.v2#/$defs/Block" } }
              },
              "required": ["blocks"]
            }
          }
        }
      }
    },
    {
      "properties": {
        "name": { "const": "tool.error" },
        "args": {
          "type": "object",
          "additionalProperties": false,
          "required": ["callId", "code", "message"],
          "properties": {
            "callId": { "type": "string", "minLength": 1 },
            "code": {
              "type": "string",
              "enum": ["INVALID_ARGS","UNAUTHORIZED","FORBIDDEN","NOT_FOUND","CONFLICT","PRECONDITION_FAILED","RATE_LIMITED","BACKEND_UNAVAILABLE","TIMEOUT","CANCELLED","INTERNAL"]
            },
            "message": { "type": "string", "minLength": 1 },
            "retriable": { "type": "boolean" }
          }
        }
      }
    },
    {
      "properties": {
        "name": { "const": "ui.rendered" },
        "args": {
          "type": "object", "additionalProperties": false,
          "required": ["requestId", "messageId"],
          "properties": {
            "requestId": { "type": "string", "minLength": 1 },
            "messageId": { "type": "string", "minLength": 1 }
          }
        }
      }
    },
    {
      "properties": {
        "name": { "const": "ui.error" },
        "args": {
          "type": "object", "additionalProperties": false,
          "required": ["requestId", "messageId", "code", "message"],
          "properties": {
            "requestId": { "type": "string", "minLength": 1 },
            "messageId": { "type": "string", "minLength": 1 },
            "code": { "type": "string", "minLength": 1 },
            "message": { "type": "string", "minLength": 1 }
          }
        }
      }
    }
  ]
}

7. 示例（含结构化输入/输出）
7.1 下行 UI：卡片 + 测算按钮（带入参与输出 Schema）
{
  "schema": "ui-blocks@2",
  "requestId": "req_20240928_001",
  "messageId": "msg_loan_calc_001",
  "text": "这是一个贷款测算示例。",
  "blocks": [
    {
      "id": "card.loan",
      "type": "card",
      "title": "公积金贷款测算",
      "body": [
        {
          "id": "tbl.summary",
          "type": "table",
          "columns": [ { "id": "item", "label": "项目" }, { "id": "value", "label": "数值" } ],
          "rows": [
            { "id": "r1", "cells": { "item": "月缴存额", "value": "800元" } },
            { "id": "r2", "cells": { "item": "缴存年限", "value": "3年" } },
            { "id": "r3", "cells": { "item": "账户余额", "value": "28,000元" } },
            { "id": "r4", "cells": { "item": "可贷额度", "value": "约25万元" } }
          ]
        },
        {
          "id": "act.main",
          "type": "actions",
          "items": [
            {
              "id":"calc",
              "label":"测算贷款额度",
              "style":"primary",
              "action":{
                "type":"tool","name":"calculate_loan",
                "argumentsSchema":{
                  "$schema":"https://json-schema.org/draft/2020-12/schema",
                  "$id":"urn:tool:calculate_loan:args",
                  "type":"object",
                  "required":["monthlyDeposit","years","balance"],
                  "properties":{
                    "monthlyDeposit":{"type":"number","minimum":0},
                    "years":{"type":"number","minimum":0},
                    "balance":{"type":"number","minimum":0}
                  },
                  "additionalProperties":false
                },
                "resultSchema":{
                  "$schema":"https://json-schema.org/draft/2020-12/schema",
                  "$id":"urn:tool:calculate_loan:result",
                  "type":"object",
                  "required":["maxAmount","annualRate"],
                  "properties":{
                    "maxAmount":{"type":"number","minimum":0},
                    "annualRate":{"type":"number","minimum":0,"maximum":1},
                    "explain":{"type":"string"}
                  },
                  "additionalProperties":false
                }
              }
            }
          ]
        }
      ]
    }
  ]
}

7.2 上行：点击按钮触发 tool.invoke
{
  "name": "tool.invoke",
  "args": {
    "callId": "call_calc_0001",
    "requestId": "req_20240928_001",
    "messageId": "msg_loan_calc_001",
    "origin": { "blockId": "act.main", "actionId": "calc", "type": "actions" },
    "tool": { "name": "calculate_loan", "argumentsSchemaRef":"urn:tool:calculate_loan:args", "resultSchemaRef":"urn:tool:calculate_loan:result" },
    "arguments": { "monthlyDeposit": 800, "years": 3, "balance": 28000 }
  }
}

7.3 后端结果（最终，带结构化 output 与 UI）
{
  "name": "tool.result",
  "args": {
    "callId": "call_calc_0001",
    "final": true,
    "outputSchemaRef": "urn:tool:calculate_loan:result",
    "output": { "maxAmount": 260000, "annualRate": 0.031, "explain": "基于余额、月缴与年限测算" },
    "ui": {
      "text": "测算完成。",
      "blocks": [
        {
          "id": "card.result",
          "type": "card",
          "title": "测算结果",
          "body": [
            {
              "id": "kv.result",
              "type": "kv",
              "items": [
                { "id": "kv.max", "key": "最高可贷", "value": "260,000 元" },
                { "id": "kv.rate", "key": "年利率",   "value": "3.10%" }
              ]
            },
            { "id": "btn.recalc", "type": "button", "text": "重新测算", "action": { "type": "tool", "name": "calculate_loan" } }
          ]
        }
      ]
    }
  }
}

8. 校验与落地建议

后端在下发前使用 JSON Schema 校验：

下行：ui-blocks.v2.json

上行：ui-events.v2.json

工具输入/输出：使用 ToolAction.argumentsSchema/resultSchema

前端：

- 入口（接收/发送）：使用 `hooks/useUIBlocksChannel.ts:1` 封装的通道；
- 运行时校验：可选接入 AJV 对 `ui-blocks.v2.json`/`ui-events.v2.json` 进行双向校验（避免与渲染强耦合，建议在 Hook 层完成，渲染只接收已通过校验的对象）；
- 记录：建议统一记录 `requestId/messageId/callId` 三元组便于排查。

TypeScript 可由 Schema 生成类型（或在 lib/ui-blocks/types.ts 手写对齐）。

9. 严格性与安全

强约束：

schema === "ui-blocks@2"

attributes.content-type === "application/vnd.ui-blocks+json"

attributes.version === "2"（与 schema 一致）

禁止未声明字段、禁止原生 HTML/脚本/内联样式注入；

敏感字段（身份证/手机号/银行卡）：sensitive:true，默认日志脱敏；redact/maskOnClient 按需设置；

事件命名固定集合：tool.invoke | tool.cancel | tool.result | tool.error | ui.rendered | ui.error。

10. 版本策略

当前版本：ui-blocks@2（开发基线）

若加入增量更新/流式与更多块类型，将发布 ui-blocks@2.1+ 并提供 Schema 更新。

破坏性更新说明：相较先前草案，本版将 ToolAction.schema 拆分并升级为 argumentsSchema/resultSchema（或对应的 *SchemaRef）。如旧字段仍存在，前端应忽略旧 schema 并以新字段为准。

11. 本次修正与纠错清单（便于审阅）

版本一致性：明确 attributes.version 必须与 schema:"ui-blocks@2" 一致，不一致即拒收。

Schema 引用域名：将 $id/$ref 从示例域名替换为内部稳定 urn:lk:*，避免解析失败。

严格结构化输出：新增 ToolAction.argumentsSchema/resultSchema 与对应 *SchemaRef；tool.result 新增 output/outputSchemaRef，对齐“结构化输出”最佳实践。

FormField 类型约束：用 if/then 为 number/date/email/tel 施加更精确的校验，defaultValue 类型随 input 变化。

错误码枚举：规范 tool.error.code 的取值与 retriable 策略。

取消终态：明确 tool.cancel 后后端必须回终态（tool.error(CANCELLED) 或 tool.result(final:true, cancelled:true)），避免悬挂。

文档一致性：统一叙述“所有对象 additionalProperties:false”与“稳定 id 正则”；示例中的 ui.blocks 与事件 Schema 引用保持一致。

附：最小实现建议（可选）

前端：

收到 ToolAction.argumentsSchema 时自动增强表单校验；没有表单时可动态生成弹层表单；

对 tool.result.output 先校验再渲染；失败则发 ui.error 并忽略该输出。

后端：

对 tool.invoke.arguments 按 argumentsSchema 做强校验，失败返回 tool.error(INVALID_ARGS)；

业务返回对象按 resultSchema 校验；

确保每个 callId 有终态回执。

附：前后端对接与项目结构（最佳实践）

- 后端房间/令牌发放：`app/api/connection-details/route.ts:1`（LiveKit Server SDK 生成房间名与 JWT，字段：serverUrl/roomName/participantToken/participantName）。
- 前端通道封装：`hooks/useUIBlocksChannel.ts:1`（单一职责：收消息、最小校验、事件上报）。
- 类型与常量：`lib/ui-blocks/index.ts:1`（topic/content-type/version/最小类型）。
- Schema 存放：`lib/ui-blocks/schema/ui-blocks.v2.json:1`、`lib/ui-blocks/schema/ui-events.v2.json:1`。
- 渲染层（可选）：建议新增 `components/livekit/ui-blocks/*`，按 Block.type 分文件实现，渲染逻辑与工具调用通过 props 回传 `sendUIEvent`。

补充说明：LiveKit Components 提供 `useChat({ channelTopic })` 与 `useDataChannel(topic)`。本规范选用 Chat/text 通道承载 JSON 字符串，并通过 attributes 携带版本与内容类型。需要高吞吐或二进制负载时，可切换 DataChannel，字段与事件语义保持不变。

以上即为完整的可交付文档。如果你需要，我也可以把这两份 Schema 拆成独立 .json 文件（文件名/路径与你的目录结构对齐），或者提供一段 TS/py 校验示例骨架，方便你直接接入。
