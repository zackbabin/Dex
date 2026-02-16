#!/usr/bin/env python3
"""
Dex Analytics MCP Server

Fires events to Pendo Track Events API for product analytics.
Privacy-first: Only fires when user has opted in via consent flow.

Usage:
    python analytics_server.py
"""

import os
import sys
import json
import hashlib

# Health system — error queue and health reporting
try:
    sys.path.insert(0, str(os.path.join(os.path.dirname(__file__), '..', '..')))
    from core.utils.dex_logger import log_error as _log_health_error, mark_healthy as _mark_healthy
    _HAS_HEALTH = True
except ImportError:
    _HAS_HEALTH = False
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# MCP SDK imports
try:
    from mcp.server import Server
    from mcp.types import Tool, TextContent
    from mcp.server.stdio import stdio_server
except ImportError:
    print("Error: MCP SDK not installed. Run: pip install mcp", file=sys.stderr)
    sys.exit(1)

# Import analytics helper (same directory)
sys.path.insert(0, str(Path(__file__).parent))
from analytics_helper import (
    is_analytics_enabled,
    check_consent,
    get_visitor_info,
    get_pendo_secret,
    fire_event,
    calculate_journey_metadata,
    load_user_profile,
    get_vault_path,
    PENDO_ENDPOINT,
)

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def log_event_locally(event_name: str, properties: dict, visitor_id: str):
    """Log event to local file as backup."""
    log_path = get_vault_path() / 'System' / 'analytics_log.jsonl'
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": event_name,
        "visitor_id": visitor_id,
        "properties": properties
    }
    try:
        with open(log_path, 'a') as f:
            f.write(json.dumps(entry) + '\n')
    except Exception:
        pass


# Create MCP server
server = Server("dex-analytics")


@server.list_tools()
async def list_tools():
    """List available analytics tools."""
    return [
        Tool(
            name="track_event",
            description="Track a Dex usage event. Only fires if user has opted into analytics.",
            inputSchema={
                "type": "object",
                "properties": {
                    "event_name": {
                        "type": "string",
                        "description": "Event name (e.g., 'skill_invoked', 'task_completed')"
                    },
                    "properties": {
                        "type": "object",
                        "description": "Event properties (e.g., {skill_name: 'daily-plan'})",
                        "default": {}
                    }
                },
                "required": ["event_name"]
            }
        ),
        Tool(
            name="identify_user",
            description="Identify user in Pendo (called once during onboarding or session start).",
            inputSchema={
                "type": "object",
                "properties": {
                    "metadata": {
                        "type": "object",
                        "description": "User metadata (role, company_size, pillars_count, etc.)",
                        "default": {}
                    }
                },
                "required": []
            }
        ),
        Tool(
            name="check_analytics_status",
            description="Check if analytics is enabled and configured correctly.",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="test_connection",
            description="Test Pendo connection with a test event.",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        )
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Handle tool calls."""
    try:
        return await _call_tool_inner(name, arguments)
    except Exception as e:
        if _HAS_HEALTH:
            _log_health_error("dex-analytics", str(e), context={"tool": name})
        raise

async def _call_tool_inner(name: str, arguments: dict) -> list[TextContent]:
    if name == "check_analytics_status":
        enabled = is_analytics_enabled()
        consent = check_consent()
        secret_configured = get_pendo_secret() is not None
        visitor_info = get_visitor_info()

        result = {
            "analytics_enabled": enabled,
            "consent_status": consent,
            "pendo_secret_configured": secret_configured,
            "requests_available": HAS_REQUESTS,
            "visitor_id": visitor_info['visitor_id'],
            "account_id": visitor_info['account_id'],
            "ready": enabled and secret_configured and HAS_REQUESTS
        }

        return [TextContent(type="text", text=json.dumps(result, indent=2))]

    elif name == "track_event":
        event_name = arguments.get("event_name")
        properties = arguments.get("properties", {})

        if not event_name:
            return [TextContent(type="text", text=json.dumps({"error": "event_name required"}))]

        # Check if analytics is enabled (consent-gated)
        if not is_analytics_enabled():
            visitor_info = get_visitor_info()
            log_event_locally(event_name, properties, visitor_info['visitor_id'])
            return [TextContent(type="text", text=json.dumps({
                "fired": False,
                "reason": "analytics_disabled",
                "logged_locally": True
            }))]

        # Fire via helper (uses requests, handles journey metadata)
        result = fire_event(event_name, properties)

        # Also log locally as backup
        visitor_info = get_visitor_info()
        log_event_locally(event_name, properties, visitor_info['visitor_id'])
        result["logged_locally"] = True

        return [TextContent(type="text", text=json.dumps(result, indent=2))]

    elif name == "identify_user":
        metadata = arguments.get("metadata", {})

        if not is_analytics_enabled():
            return [TextContent(type="text", text=json.dumps({
                "identified": False,
                "reason": "analytics_disabled"
            }))]

        profile = load_user_profile()

        # Merge profile data with provided metadata
        identify_props = {
            "role": profile.get("role", "unknown"),
            "role_group": profile.get("role_group", "unknown"),
            "company_size": profile.get("company_size", "unknown"),
            "pillars_count": len(profile.get("pillars", [])),
            "obsidian_enabled": profile.get("obsidian_mode", False),
            "granola_enabled": profile.get("meeting_processing", {}).get("mode") == "automatic",
            **metadata
        }

        result = fire_event("user_identified", identify_props)
        return [TextContent(type="text", text=json.dumps(result, indent=2))]

    elif name == "test_connection":
        if not HAS_REQUESTS:
            return [TextContent(type="text", text=json.dumps({
                "success": False,
                "error": "requests library not installed. Run: pip install requests"
            }))]

        secret = get_pendo_secret()
        if not secret:
            return [TextContent(type="text", text=json.dumps({
                "success": False,
                "error": "PENDO_TRACK_SECRET not configured."
            }))]

        visitor_info = get_visitor_info()
        test_visitor = "test-" + visitor_info['visitor_id'][:8]

        payload = {
            "type": "track",
            "event": "dex_analytics_test",
            "visitorId": test_visitor,
            "accountId": "dex-test",
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
            "properties": {"test": True, "timestamp": datetime.now().isoformat()}
        }

        headers = {
            "Content-Type": "application/json",
            "x-pendo-integration-key": secret
        }

        try:
            response = requests.post(PENDO_ENDPOINT, json=payload, headers=headers, timeout=10)
            if response.status_code == 200:
                return [TextContent(type="text", text=json.dumps({
                    "success": True,
                    "status": response.status_code,
                    "visitor_id_used": test_visitor
                }))]
            else:
                return [TextContent(type="text", text=json.dumps({
                    "success": False,
                    "status": response.status_code,
                    "body": response.text[:200]
                }))]
        except Exception as e:
            return [TextContent(type="text", text=json.dumps({
                "success": False,
                "error": str(e)
            }))]

    else:
        return [TextContent(type="text", text=json.dumps({"error": f"Unknown tool: {name}"}))]


async def main():
    """Run the MCP server."""
    if _HAS_HEALTH:
        _mark_healthy("dex-analytics")
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
