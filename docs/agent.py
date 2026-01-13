import asyncio
import json
import logging
import os
import urllib.request
import urllib.error
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from livekit import agents, api, rtc
from livekit.agents import AgentSession, Agent, RoomInputOptions
from livekit.agents.voice.room_io import RoomOutputOptions, ATTRIBUTE_PUBLISH_ON_BEHALF
from livekit.agents.voice.avatar import DataStreamAudioOutput
from livekit.plugins import (
    openai,
    cartesia,
    deepgram,
    silero,
)
from livekit.plugins.turn_detector.multilingual import MultilingualModel

# Minimal, v2-focused agent that:
# - Sends UI Blocks v2 payloads (lk.ui.blocks)
# - Handles UI Events v2 (lk.ui.events): tool.invoke / tool.cancel → tool.result / tool.error
# - Avoids any v1 utilities and does not mutate payloads (no id/ts injection)

load_dotenv()
logger = logging.getLogger("agent-v2")
_lvl = os.getenv("AGENT_LOG_LEVEL", "INFO").upper()
logger.setLevel(getattr(logging, _lvl, logging.INFO))


# ---------------- Sending helpers (v2) ----------------

async def send_ui_blocks_v2(
    room: rtc.Room,
    payload: Dict[str, Any],
    *,
    destination_identity: Optional[str] = None,
    attributes: Optional[Dict[str, str]] = None,
) -> None:
    """Send a UI Blocks v2 payload on topic 'lk.ui.blocks'.

    - Enforces schema 'ui-blocks@2'
    - Does NOT add extra fields (respects additionalProperties:false)
    - Sets Chat attributes: { content-type, version: "2", requestId? }
    """
    if not isinstance(payload, dict):
        raise ValueError("payload must be a dict")
    if payload.get("schema") != "ui-blocks@2":
        raise ValueError("schema must be 'ui-blocks@2'")

    attrs = {
        "content-type": "application/vnd.ui-blocks+json",
        "version": "2",
    }
    req_id = payload.get("requestId")
    if isinstance(req_id, str) and req_id:
        attrs["requestId"] = req_id
    if attributes:
        attrs.update(attributes)

    await room.local_participant.send_text(
        text=json.dumps(payload, ensure_ascii=False),
        topic="lk.ui.blocks",
        attributes=attrs,
        destination_identities=[destination_identity] if destination_identity else None,
    )


async def send_ui_event_v2(
    room: rtc.Room,
    event: Dict[str, Any],
    *,
    destination_identity: Optional[str] = None,
    attributes: Optional[Dict[str, str]] = None,
) -> None:
    """Send a UI Events v2 payload on topic 'lk.ui.events'."""
    if not isinstance(event, dict):
        raise ValueError("event must be a dict")
    attrs = {"version": "2"}
    if attributes:
        attrs.update(attributes)
    await room.local_participant.send_text(
        text=json.dumps(event, ensure_ascii=False),
        topic="lk.ui.events",
        attributes=attrs,
        destination_identities=[destination_identity] if destination_identity else None,
    )


# ---------------- v2 UI Events Handler ----------------

def register_ui_events_handler(room: rtc.Room) -> None:
    """Register v2 UI Events handler on 'lk.ui.events'.

    Handles:
      - tool.invoke → optional progress + final tool.result (with ui/output)
      - tool.cancel → terminal tool.error(CANCELLED)
      - ui.rendered/ui.error → logged only (optional)
    """

    running: Dict[str, asyncio.Task] = {}

    def _on(reader: rtc.TextStreamReader, participant_identity: str) -> None:
        async def _read() -> None:
            try:
                raw = await reader.read_all()
                evt = json.loads(raw)
            except Exception as e:
                logger.warning("[ui.events] invalid json: %s", e)
                return

            name = evt.get("name")
            args = evt.get("args") or {}
            logger.info("[ui.events/v2] from=%s name=%s args=%s", participant_identity, name, args)

            async def _terminal_cancel(call_id: str, reason: Optional[str] = None) -> None:
                try:
                    await send_ui_event_v2(
                        room,
                        {
                            "name": "tool.error",
                            "args": {"callId": call_id, "code": "CANCELLED", "message": reason or "cancelled", "retriable": False},
                        },
                        destination_identity=participant_identity,
                    )
                except Exception as e:
                    logger.debug("[ui.events] cancel send failed: %s", e)

            if name == "tool.invoke":
                call_id = args.get("callId")
                request_id = args.get("requestId")
                message_id = args.get("messageId")
                origin = args.get("origin") or {}
                tool = args.get("tool") or {}
                tool_name = tool.get("name")
                tool_args = args.get("arguments") or {}

                if not all(isinstance(x, str) and x for x in [call_id, request_id, message_id, tool_name]):
                    logger.warning("[ui.events] missing required fields in tool.invoke")
                    await send_ui_event_v2(
                        room,
                        {
                            "name": "tool.error",
                            "args": {"callId": call_id or "", "code": "INVALID_ARGS", "message": "missing callId/requestId/messageId/tool.name", "retriable": False},
                        },
                        destination_identity=participant_identity,
                    )
                    return

                async def _run() -> None:
                    try:
                        # Optional progress
                        await send_ui_event_v2(
                            room,
                            {"name": "tool.result", "args": {"callId": call_id, "final": False, "progress": 0.0, "content": {"text": "处理中..."}}},
                            destination_identity=participant_identity,
                        )

                        # Simulate processing
                        await asyncio.sleep(0.3)

                        # Prepare a simple UI Blocks v2 result card
                        ui_payload = {
                            "schema": "ui-blocks@2",
                            "requestId": request_id,
                            "messageId": f"msg.{call_id}",
                            "lang": "zh-CN",
                            "text": "办理完成。",
                            "blocks": [
                                {
                                    "id": "card.result",
                                    "type": "card",
                                    "title": "执行结果",
                                    "body": [
                                        {
                                            "id": "kv.result",
                                            "type": "kv",
                                            "items": [
                                                {"id": "kv.tool", "key": "工具", "value": tool_name},
                                                {"id": "kv.block", "key": "来源块", "value": origin.get("blockId", "-")},
                                            ],
                                        },
                                        {"id": "btn.ok", "type": "button", "text": "好的", "action": {"type": "tool", "name": "acknowledge"}},
                                    ],
                                }
                            ],
                        }

                        await send_ui_event_v2(
                            room,
                            {
                                "name": "tool.result",
                                "args": {
                                    "callId": call_id,
                                    "final": True,
                                    "output": {"ok": True, "echo": tool_args},
                                    "ui": ui_payload,
                                },
                            },
                            destination_identity=participant_identity,
                        )
                    except asyncio.CancelledError:
                        await _terminal_cancel(call_id, reason="cancelled by user")
                    except Exception as e:
                        logger.warning("[tool] failed: %s", e)
                        await send_ui_event_v2(
                            room,
                            {"name": "tool.error", "args": {"callId": call_id, "code": "INTERNAL", "message": str(e), "retriable": False}},
                            destination_identity=participant_identity,
                        )
                    finally:
                        running.pop(call_id, None)

                t = asyncio.create_task(_run())
                running[call_id] = t

            elif name == "tool.cancel":
                call_id = args.get("callId")
                reason = args.get("reason")
                t = running.get(str(call_id)) if call_id is not None else None
                if t and not t.done():
                    t.cancel()
                else:
                    await _terminal_cancel(str(call_id or ""), reason=reason)

            elif name in ("ui.rendered", "ui.error"):
                # Optional: observability hooks
                logger.info("[ui.events] %s: %s", name, args)
            else:
                logger.info("[ui.events] unsupported event: %s", name)

        asyncio.create_task(_read())

    room.register_text_stream_handler("lk.ui.events", _on)
    logger.info("registered v2 ui.events handler on 'lk.ui.events'")


# ---------------- Entrypoint ----------------

async def _post_json(url: str, payload: dict) -> None:
    def _do_post() -> None:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=10):
            pass

    await asyncio.to_thread(_do_post)


async def _launch_avatar(ctx: agents.JobContext, dispatcher_url: str, avatar_identity: str) -> None:
    try:
        token = (
            api.AccessToken()
            .with_identity(avatar_identity)
            .with_name("Avatar Runner")
            .with_grants(api.VideoGrants(room_join=True, room=ctx.room.name))
            .with_kind("agent")
            .with_attributes({ATTRIBUTE_PUBLISH_ON_BEHALF: ctx.token_claims().identity})
            .to_jwt()
        )
        payload = {"room_name": ctx.room.name, "url": ctx._info.url, "token": token}
        logger.info("[avatar] requesting join via %s", dispatcher_url)
        await _post_json(dispatcher_url, payload)
        logger.info("[avatar] dispatcher handshake completed")
    except Exception as e:
        logger.warning("[avatar] launch failed: %s", e)

async def _send_initial_ui(room: rtc.Room) -> None:
    # Minimal example UI (v2): title + summary + actions + form
    payload: Dict[str, Any] = {
        "schema": "ui-blocks@2",
        "requestId": "req.welcome",
        "messageId": "msg.welcome",
        "lang": "zh-CN",
        "text": "欢迎使用 v2 界面。",
        "blocks": [
            {"id": "t.title", "type": "text", "content": "UI Blocks v2 示例", "variant": "title", "format": "plain"},
            {
                "id": "card.summary",
                "type": "card",
                "title": "账户概览",
                "body": [
                    {"id": "kv.base", "type": "kv", "items": [
                        {"id": "kv.name", "key": "姓名", "value": "张三"},
                        {"id": "kv.years", "key": "缴存年限", "value": "3"},
                        {"id": "kv.balance", "key": "账户余额", "value": "¥ 58,200.00"},
                    ]}
                ],
            },
            {
                "id": "tbl.plan",
                "type": "table",
                "columns": [
                    {"id": "date", "label": "日期", "align": "left"},
                    {"id": "amount", "label": "金额", "align": "right"},
                ],
                "rows": [
                    {"id": "r1", "cells": {"date": "2025-09-30", "amount": "¥2,345.00"}},
                    {"id": "r2", "cells": {"date": "2025-10-30", "amount": "¥2,345.00"}},
                ],
            },
            {
                "id": "act.main",
                "type": "actions",
                "items": [
                    {
                        "id": "calc",
                        "label": "测算贷款额度",
                        "style": "primary",
                        "action": {
                            "type": "tool",
                            "name": "calculate_loan",
                            # Optional: input schema to enable front-end validation
                            "argumentsSchema": {
                                "$schema": "https://json-schema.org/draft/2020-12/schema",
                                "$id": "urn:tool:calculate_loan:args",
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "monthlyDeposit": {"type": "number", "minimum": 0},
                                    "years": {"type": "integer", "minimum": 1, "maximum": 40},
                                    "balance": {"type": "number", "minimum": 0}
                                },
                                "required": ["monthlyDeposit", "years", "balance"]
                            },
                            "resultSchema": {
                                "$schema": "https://json-schema.org/draft/2020-12/schema",
                                "$id": "urn:tool:calculate_loan:result",
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "maxAmount": {"type": "number"},
                                    "annualRate": {"type": "number"},
                                    "explain": {"type": "string"}
                                },
                                "required": ["maxAmount", "annualRate"]
                            }
                        },
                    }
                ],
            },
            {
                "id": "form.withdraw",
                "type": "form",
                "title": "提取申请",
                "fields": [
                    {"id": "applicant_name", "label": "申请人姓名", "input": "text", "required": True},
                    {"id": "id_number", "label": "身份证号码", "input": "text", "required": True, "maxLength": 18},
                    {"id": "phone", "label": "联系电话", "input": "tel", "required": True},
                    {"id": "extract_reason", "label": "提取原因", "input": "select", "options": [
                        {"id": "opt-buy", "label": "购房提取"},
                        {"id": "opt-repay", "label": "还贷提取"},
                        {"id": "opt-rent", "label": "租房提取"}
                    ]},
                    {"id": "extract_amount", "label": "提取金额（元）", "input": "number", "min": 0},
                    {"id": "bank_name", "label": "开户银行", "input": "text"}
                ],
                "submit": {"label": "提交申请", "action": {"type": "tool", "name": "submit_withdraw"}},
            },
        ],
    }

    await send_ui_blocks_v2(room, payload)


async def entrypoint(ctx: agents.JobContext):
    # Connect to room first
    await ctx.connect()
    logger.info("connected to room: %s", ctx.room.name)

    # Register v2 events handler early (before session start)
    register_ui_events_handler(ctx.room)

    # Launch avatar and route agent audio to it (parity with agent.py)
    dispatcher_url = os.getenv("AVATAR_DISPATCHER_URL", "http://localhost:8089/launch")
    await _launch_avatar(ctx, dispatcher_url, AVATAR_IDENTITY)

    # Start AgentSession to expose tracks/state to frontend
    session = AgentSession(
        stt=deepgram.STT(model="nova-2", language="zh-CN"),
        llm=openai.LLM.with_deepseek(model="deepseek-chat"),
        tts=cartesia.TTS(model="sonic-2", voice="4df027cb-2920-4a1f-8c34-f21529d5c3fe"),
        vad=silero.VAD.load(),
        turn_detection=MultilingualModel(),
    )

    # Minimal agent (no tools/instructions needed for UI-only demo)
    class _MinimalAgent(Agent):
        def __init__(self) -> None:
            super().__init__(instructions="")

    # Route audio to avatar via DataStream; wait for avatar video track before output audio
    session.output.audio = DataStreamAudioOutput(
        ctx.room,
        destination_identity=AVATAR_IDENTITY,
        wait_remote_track=rtc.TrackKind.KIND_VIDEO,
    )

    await session.start(
        room=ctx.room,
        agent=_MinimalAgent(),
        room_input_options=RoomInputOptions(),
        room_output_options=RoomOutputOptions(
            audio_enabled=False,
            transcription_enabled=True,
        ),
    )

    # Small delay to allow frontend subscription to settle
    await asyncio.sleep(0.2)

    # Send initial v2 UI
    try:
        await _send_initial_ui(ctx.room)
    except Exception as e:
        logger.warning("failed to send initial v2 UI: %s", e)

    # Keep running
    await asyncio.Event().wait()


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
        )
    )
# Avatar identity for routing audio via DataStreamAudioOutput
AVATAR_IDENTITY = "avatar_worker"
