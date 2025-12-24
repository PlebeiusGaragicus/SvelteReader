"""Structured logging for the LangGraph agent.

Writes JSONL logs to agent/logs/{thread_id}.jsonl for debugging and analysis.
Each thread gets its own log file containing the full conversation context.
Each line is a self-contained JSON object that can be grepped/parsed.

Usage:
    from agent.logging import agent_logger
    
    # In a node function:
    agent_logger.log_run_start(thread_id, run_id, input_data)
    agent_logger.log_tool_call(thread_id, run_id, tool_name, args, result, error)
    agent_logger.log_run_end(thread_id, run_id, output, duration_ms, success)
"""

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from contextlib import contextmanager
import threading


class AgentLogger:
    """Thread-safe structured logger for agent runs.
    
    Creates one log file per thread_id for easy debugging of complete conversations.
    """
    
    def __init__(self, log_dir: str | None = None):
        if log_dir is None:
            # Default to agent/logs relative to this file
            self.log_dir = Path(__file__).parent.parent.parent / "logs"
        else:
            self.log_dir = Path(log_dir)
        
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        
        # In-memory buffer for current run (for quick access)
        self._current_run: dict[str, Any] = {}
    
    def _get_log_file(self, thread_id: str) -> Path:
        """Get the log file path for a thread."""
        # Sanitize thread_id for filename
        safe_id = thread_id.replace("/", "_").replace("\\", "_")
        return self.log_dir / f"{safe_id}.jsonl"
    
    def _write_event(self, thread_id: str, event: dict[str, Any]) -> None:
        """Write a single event to the thread's log file."""
        event["timestamp"] = datetime.now(timezone.utc).isoformat()
        event["thread_id"] = thread_id
        
        log_file = self._get_log_file(thread_id)
        
        with self._lock:
            with open(log_file, "a") as f:
                f.write(json.dumps(event, default=str) + "\n")
    
    def log_run_start(
        self,
        thread_id: str,
        run_id: str,
        message: str,
        book_context: str | None = None,
        passage_context: dict | None = None,
        payment: dict | None = None,
    ) -> None:
        """Log the start of an agent run within a thread."""
        event = {
            "event": "run_start",
            "run_id": run_id,
            "message": message,
            "book_context_length": len(book_context) if book_context else 0,
            "book_context_preview": _truncate(book_context, 500) if book_context else None,
            "has_passage_context": passage_context is not None,
            "has_payment": payment is not None,
        }
        
        # Store full context in memory for debug script
        self._current_run = {
            "thread_id": thread_id,
            "run_id": run_id,
            "message": message,
            "book_context": book_context,
            "passage_context": passage_context,
            "tool_calls": [],
            "start_time": time.time(),
        }
        
        self._write_event(thread_id, event)
        print(f"[Logger] Thread {thread_id[:8]}... Run started: {run_id[:8]}...")
    
    def log_tool_call(
        self,
        thread_id: str,
        run_id: str,
        tool_name: str,
        args: dict[str, Any],
        result: Any = None,
        error: str | None = None,
        duration_ms: int | None = None,
    ) -> None:
        """Log a tool call (from agent) or tool result (from client)."""
        # Include result preview in log for debugging
        result_preview = None
        if result is not None:
            result_str = str(result)
            result_preview = _truncate(result_str, 500)
        
        event = {
            "event": "tool_call",
            "run_id": run_id,
            "tool_name": tool_name,
            "args": args,
            "result_preview": result_preview,
            "error": error,
            "duration_ms": duration_ms,
        }
        
        # Store in current run
        if self._current_run.get("run_id") == run_id:
            self._current_run["tool_calls"].append({
                "tool_name": tool_name,
                "args": args,
                "result_preview": result_preview,
                "error": error,
                "duration_ms": duration_ms,
            })
        
        self._write_event(thread_id, event)
        status = "ERROR" if error else "OK"
        print(f"[Logger] Tool: {tool_name}({_format_args(args)}) -> {status}")
    
    def log_llm_response(
        self,
        thread_id: str,
        run_id: str,
        content: str,
        tool_calls: list[dict] | None = None,
        finish_reason: str | None = None,
    ) -> None:
        """Log an LLM response."""
        event = {
            "event": "llm_response",
            "run_id": run_id,
            "content_length": len(content) if content else 0,
            "content_preview": _truncate(content, 500) if content else None,
            "tool_calls": [{"name": tc.get("name"), "args": tc.get("args")} for tc in (tool_calls or [])],
            "finish_reason": finish_reason,
        }
        
        self._write_event(thread_id, event)
        
        if tool_calls:
            tool_names = [tc.get("name") for tc in tool_calls]
            print(f"[Logger] LLM requested tools: {tool_names}")
        else:
            print(f"[Logger] LLM response: {_truncate(content, 100)}")
    
    def log_run_end(
        self,
        thread_id: str,
        run_id: str,
        final_response: str | None = None,
        success: bool = True,
        error: str | None = None,
        duration_ms: int | None = None,
        refund: bool = False,
    ) -> None:
        """Log the end of an agent run."""
        # Calculate duration if not provided
        if duration_ms is None and self._current_run.get("run_id") == run_id:
            start_time = self._current_run.get("start_time")
            if start_time:
                duration_ms = int((time.time() - start_time) * 1000)
        
        event = {
            "event": "run_end",
            "run_id": run_id,
            "success": success,
            "error": error,
            "refund": refund,
            "duration_ms": duration_ms,
            "response_length": len(final_response) if final_response else 0,
            "response_preview": _truncate(final_response, 500) if final_response else None,
            "tool_call_count": len(self._current_run.get("tool_calls", [])),
        }
        
        self._write_event(thread_id, event)
        
        status = "SUCCESS" if success else "FAILED"
        print(f"[Logger] Run ended: {status} ({duration_ms}ms)")
        
        # Clear current run
        self._current_run = {}
    
    def log_payment(
        self,
        thread_id: str,
        run_id: str,
        event_type: str,  # "validated", "redeemed", "refund_needed"
        amount_sats: int | None = None,
        token_preview: str | None = None,
    ) -> None:
        """Log payment-related events."""
        event = {
            "event": f"payment_{event_type}",
            "run_id": run_id,
            "amount_sats": amount_sats,
            "token_preview": token_preview[:20] + "..." if token_preview and len(token_preview) > 20 else token_preview,
        }
        self._write_event(thread_id, event)
        print(f"[Logger] Payment {event_type}: {amount_sats} sats")
    
    def log_tool_interrupt(
        self,
        thread_id: str,
        run_id: str,
        tool_calls: list[dict],
    ) -> None:
        """Log when the graph interrupts for client-side tool execution."""
        event = {
            "event": "tool_interrupt",
            "run_id": run_id,
            "tool_calls": [{"name": tc.get("name"), "args": tc.get("args")} for tc in tool_calls],
        }
        self._write_event(thread_id, event)
        tool_names = [tc.get("name") for tc in tool_calls]
        print(f"[Logger] Interrupt for tools: {tool_names}")
    
    def log_tool_resume(
        self,
        thread_id: str,
        run_id: str,
        tool_results: list[dict],
    ) -> None:
        """Log when the graph resumes after client-side tool execution."""
        event = {
            "event": "tool_resume",
            "run_id": run_id,
            "tool_results": tool_results,
        }
        self._write_event(thread_id, event)
        print(f"[Logger] Resumed with {len(tool_results)} tool results")
    
    def get_current_run(self) -> dict[str, Any]:
        """Get the current run's in-memory data (for debugging)."""
        return self._current_run.copy()
    
    def list_threads(self) -> list[str]:
        """List all thread IDs that have log files."""
        threads = []
        for f in self.log_dir.glob("*.jsonl"):
            threads.append(f.stem)
        return sorted(threads, key=lambda x: self._get_log_file(x).stat().st_mtime, reverse=True)
    
    def read_thread_log(self, thread_id: str) -> list[dict]:
        """Read all events for a thread."""
        log_file = self._get_log_file(thread_id)
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


def _truncate(s: str, max_len: int) -> str:
    """Truncate string with ellipsis."""
    if not s:
        return ""
    s = s.replace("\n", " ").strip()
    if len(s) <= max_len:
        return s
    return s[:max_len - 3] + "..."


def _format_args(args: dict) -> str:
    """Format args dict for logging."""
    if not args:
        return ""
    parts = []
    for k, v in args.items():
        v_str = str(v)
        if len(v_str) > 30:
            v_str = v_str[:27] + "..."
        parts.append(f'{k}="{v_str}"')
    return ", ".join(parts)


# Global logger instance
agent_logger = AgentLogger()
