#!/usr/bin/env python3
"""Debug script for analyzing agent runs by thread.

Fetches traces from LangSmith by thread ID and combines with local per-thread logs
to generate a formatted debug report for the ENTIRE conversation context.

Usage:
    python scripts/debug_agent.py                    # List recent threads, show last one
    python scripts/debug_agent.py --list             # List all threads
    python scripts/debug_agent.py --thread <id>      # Show specific thread
    python scripts/debug_agent.py --last 3           # Show last 3 threads
    python scripts/debug_agent.py | pbcopy           # Copy to clipboard (macOS)

Environment:
    LANGSMITH_API_KEY - API key for LangSmith (from .env)
    LANGCHAIN_PROJECT - Project name (default: reader-assistant)
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Optional, List, Dict, Tuple

# Load .env from project root
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        try:
            load_dotenv(env_path)
        except Exception:
            pass  # Ignore permission errors
    else:
        # Try parent .env
        env_path = Path(__file__).parent.parent.parent / ".env"
        if env_path.exists():
            try:
                load_dotenv(env_path)
            except Exception:
                pass
except ImportError:
    pass  # dotenv not installed, use system env vars


def get_langsmith_client():
    """Get LangSmith client if API key is available."""
    api_key = os.getenv("LANGSMITH_API_KEY") or os.getenv("LANGCHAIN_API_KEY")
    if not api_key:
        return None
    
    try:
        from langsmith import Client
        return Client(api_key=api_key)
    except ImportError:
        print("Warning: langsmith package not installed. Run: pip install langsmith", file=sys.stderr)
        return None
    except Exception as e:
        print(f"Warning: Failed to initialize LangSmith client: {e}", file=sys.stderr)
        return None


def get_runs_by_thread(client, thread_id: str, project_name: Optional[str] = None) -> list:
    """Fetch all runs for a specific thread from LangSmith."""
    if client is None:
        return []
    
    project = project_name or os.getenv("LANGCHAIN_PROJECT", "reader-assistant")
    
    try:
        # Filter runs by thread_id in metadata
        runs = list(client.list_runs(
            project_name=project,
            filter=f'eq(metadata.thread_id, "{thread_id}")',
            limit=100,
        ))
        return runs
    except Exception as e:
        print(f"Warning: Failed to fetch runs from LangSmith: {e}", file=sys.stderr)
        return []


def get_recent_threads_from_langsmith(client, project_name: Optional[str] = None, limit: int = 10) -> List[str]:
    """Get unique thread IDs from recent LangSmith runs."""
    if client is None:
        return []
    
    project = project_name or os.getenv("LANGCHAIN_PROJECT", "reader-assistant")
    
    try:
        runs = list(client.list_runs(
            project_name=project,
            is_root=True,
            limit=limit * 5,  # Get more runs to find unique threads
        ))
        
        seen = set()
        threads = []
        for run in runs:
            configurable = getattr(run, 'extra', {}).get('metadata', {})
            thread_id = configurable.get('thread_id')
            if thread_id and thread_id not in seen:
                seen.add(thread_id)
                threads.append(thread_id)
                if len(threads) >= limit:
                    break
        
        return threads
    except Exception as e:
        print(f"Warning: Failed to fetch threads from LangSmith: {e}", file=sys.stderr)
        return []


def read_thread_log(log_dir: Path, thread_id: str) -> List[dict]:
    """Read all events from a thread's log file."""
    log_file = log_dir / f"{thread_id}.jsonl"
    if not log_file.exists():
        return []
    
    events = []
    with open(log_file) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return events


def list_local_threads(log_dir: Path) -> List[Tuple[str, datetime]]:
    """List all thread IDs from local log files with modification times."""
    threads = []
    for f in log_dir.glob("*.jsonl"):
        if f.stem != ".gitkeep":
            mtime = datetime.fromtimestamp(f.stat().st_mtime)
            threads.append((f.stem, mtime))
    
    # Sort by modification time, newest first
    threads.sort(key=lambda x: x[1], reverse=True)
    return threads


def format_thread_report(thread_id: str, events: List[dict]) -> str:
    """Format all events for a thread as a debug report."""
    lines = []
    
    # Header
    lines.append("=" * 70)
    lines.append(f"=== Thread Debug Report: {thread_id} ===")
    lines.append("=" * 70)
    
    if not events:
        lines.append("No events found for this thread.")
        lines.append("")
        return "\n".join(lines)
    
    # Group events by run_id
    runs: Dict[str, List[dict]] = {}
    for event in events:
        rid = event.get("run_id", "unknown")
        if rid not in runs:
            runs[rid] = []
        runs[rid].append(event)
    
    lines.append(f"Total events: {len(events)}")
    lines.append(f"Total runs: {len(runs)}")
    lines.append("")
    
    # Find the user's original message
    for event in events:
        if event.get("event") == "run_start":
            msg = event.get("message", "")
            if msg:
                lines.append(f"User message: \"{_truncate(msg, 200)}\"")
                book_ctx = event.get("book_context_preview", "")
                if book_ctx:
                    lines.append(f"Book context: {_truncate(book_ctx, 100)}")
                lines.append("")
            break
    
    # Timeline of events
    lines.append("--- Event Timeline ---")
    
    tool_calls = []
    tool_results = []
    llm_responses = []
    
    for i, event in enumerate(events):
        event_type = event.get("event", "unknown")
        timestamp = event.get("timestamp", "")
        run_id = event.get("run_id", "")[:8]
        
        if event_type == "run_start":
            lines.append(f"[{run_id}] RUN START")
            
        elif event_type == "run_end":
            success = "SUCCESS" if event.get("success") else "FAILED"
            duration = event.get("duration_ms", "?")
            lines.append(f"[{run_id}] RUN END: {success} ({duration}ms)")
            response = event.get("response_preview", "")
            if response and not event.get("success", True):
                lines.append(f"         Error: {event.get('error', 'unknown')}")
                
        elif event_type == "llm_response":
            tool_calls_in_response = event.get("tool_calls", [])
            if tool_calls_in_response:
                tool_names = [tc.get("name") for tc in tool_calls_in_response]
                lines.append(f"[{run_id}] LLM -> Tool calls: {tool_names}")
                for tc in tool_calls_in_response:
                    tool_calls.append(tc)
            else:
                preview = event.get("content_preview", "")
                lines.append(f"[{run_id}] LLM -> Response: \"{_truncate(preview, 80)}\"")
                llm_responses.append(preview)
                
        elif event_type == "tool_call":
            tool_name = event.get("tool_name", "unknown")
            args = event.get("args", {})
            error = event.get("error")
            result = event.get("result_preview", "")
            
            if error:
                lines.append(f"[{run_id}] TOOL {tool_name}: ERROR - {error}")
                tool_results.append({"name": tool_name, "error": error})
            else:
                lines.append(f"[{run_id}] TOOL {tool_name}: OK ({len(result)} chars)")
                tool_results.append({"name": tool_name, "ok": True})
                
        elif event_type == "tool_interrupt":
            tool_names = [tc.get("name") for tc in event.get("tool_calls", [])]
            lines.append(f"[{run_id}] INTERRUPT for tools: {tool_names}")
            
        elif event_type == "tool_resume":
            count = len(event.get("tool_results", []))
            lines.append(f"[{run_id}] RESUME with {count} tool results")
            
        elif event_type.startswith("payment_"):
            payment_type = event_type.replace("payment_", "")
            amount = event.get("amount_sats", "?")
            lines.append(f"[{run_id}] PAYMENT: {payment_type} ({amount} sats)")
    
    lines.append("")
    
    # Summary
    lines.append("--- Summary ---")
    
    # Tool call summary
    if tool_calls:
        lines.append(f"Tool calls requested: {len(tool_calls)}")
        for tc in tool_calls:
            args_str = json.dumps(tc.get("args", {}))
            lines.append(f"  - {tc.get('name')}({_truncate(args_str, 50)})")
    
    # Tool result summary
    if tool_results:
        errors = [r for r in tool_results if r.get("error")]
        success = [r for r in tool_results if r.get("ok")]
        lines.append(f"Tool results: {len(success)} OK, {len(errors)} errors")
        if errors:
            lines.append("  Errors:")
            for e in errors:
                lines.append(f"    - {e.get('name')}: {e.get('error')}")
    
    # Final response
    if llm_responses:
        final = llm_responses[-1] if llm_responses else ""
        lines.append(f"Final response preview: \"{_truncate(final, 200)}\"")
    
    lines.append("")
    lines.append("=" * 70)
    
    return "\n".join(lines)


def _truncate(s: str, max_len: int) -> str:
    """Truncate string with ellipsis."""
    if not s:
        return ""
    s = str(s).replace("\n", " ").strip()
    if len(s) <= max_len:
        return s
    return s[:max_len - 3] + "..."


def main():
    parser = argparse.ArgumentParser(description="Debug agent runs by thread")
    parser.add_argument("--list", action="store_true", help="List all threads")
    parser.add_argument("--thread", "-t", type=str, help="Thread ID to analyze")
    parser.add_argument("--last", type=int, default=1, help="Number of recent threads to show")
    parser.add_argument("--project", type=str, help="LangSmith project name")
    parser.add_argument("--local-only", action="store_true", help="Only use local logs")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    args = parser.parse_args()
    
    # Paths
    script_dir = Path(__file__).parent
    agent_dir = script_dir.parent
    log_dir = agent_dir / "logs"
    
    # Ensure log dir exists
    log_dir.mkdir(parents=True, exist_ok=True)
    
    # Get LangSmith client
    client = None if args.local_only else get_langsmith_client()
    
    if client:
        print("Connected to LangSmith", file=sys.stderr)
    else:
        print("Using local logs only", file=sys.stderr)
    
    # List threads
    if args.list:
        print("\nLocal threads (most recent first):")
        threads = list_local_threads(log_dir)
        if not threads:
            print("  No local thread logs found.")
        else:
            for tid, mtime in threads[:20]:
                print(f"  {tid}  ({mtime.strftime('%Y-%m-%d %H:%M')})")
        return
    
    # Get specific thread or recent threads
    if args.thread:
        thread_ids = [args.thread]
    else:
        # Get from local logs
        local_threads = list_local_threads(log_dir)
        thread_ids = [tid for tid, _ in local_threads[:args.last]]
        
        if not thread_ids and client:
            # Fall back to LangSmith
            thread_ids = get_recent_threads_from_langsmith(client, args.project, args.last)
    
    if not thread_ids:
        print("No threads found. Run a chat first to generate logs.", file=sys.stderr)
        return
    
    # Output reports
    for thread_id in thread_ids:
        events = read_thread_log(log_dir, thread_id)
        
        if args.json:
            print(json.dumps({"thread_id": thread_id, "events": events}, default=str, indent=2))
        else:
            report = format_thread_report(thread_id, events)
            print(report)
            print()


if __name__ == "__main__":
    main()
