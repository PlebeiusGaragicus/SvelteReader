"""LangGraph SDK client for communicating with the self-hosted LangGraph agent.

This client wraps the langgraph-sdk to provide a clean interface for:
- Creating and managing conversation threads
- Sending messages to the agent
- Streaming responses
"""

from typing import Any, AsyncGenerator

from langgraph_sdk import get_client


class LangGraphClient:
    """Client for interacting with the LangGraph server."""

    def __init__(self, api_url: str, assistant_id: str):
        """Initialize the LangGraph client.

        Args:
            api_url: URL of the LangGraph server (e.g., http://localhost:2024)
            assistant_id: ID of the assistant/graph to use
        """
        self.api_url = api_url
        self.assistant_id = assistant_id
        self._client = None

    @property
    def client(self):
        """Lazy initialization of the LangGraph client."""
        if self._client is None:
            self._client = get_client(url=self.api_url)
        return self._client

    async def create_thread(self) -> dict[str, Any]:
        """Create a new conversation thread.

        Returns:
            Thread object with thread_id
        """
        thread = await self.client.threads.create()
        return {"thread_id": thread["thread_id"]}

    async def get_thread_state(self, thread_id: str) -> dict[str, Any]:
        """Get the current state of a thread.

        Args:
            thread_id: ID of the thread

        Returns:
            Current state of the thread including messages
        """
        state = await self.client.threads.get_state(thread_id)
        return state

    async def delete_thread(self, thread_id: str) -> None:
        """Delete a conversation thread.

        Args:
            thread_id: ID of the thread to delete
        """
        await self.client.threads.delete(thread_id)

    async def run(
        self,
        thread_id: str,
        input_data: dict[str, Any],
    ) -> dict[str, Any]:
        """Run the agent synchronously and return the final state.

        Args:
            thread_id: ID of the thread
            input_data: Input data for the agent

        Returns:
            Final state after the agent completes
        """
        # Wait for the run to complete
        result = await self.client.runs.wait(
            thread_id=thread_id,
            assistant_id=self.assistant_id,
            input=input_data,
        )
        return result

    async def stream(
        self,
        thread_id: str,
        input_data: dict[str, Any],
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Stream the agent's response.

        Args:
            thread_id: ID of the thread
            input_data: Input data for the agent

        Yields:
            Stream events from the agent
        """
        # Track accumulated content to compute deltas
        # messages/partial contains full content so far, not just new tokens
        last_content_length: dict[str, int] = {}

        async for chunk in self.client.runs.stream(
            thread_id=thread_id,
            assistant_id=self.assistant_id,
            input=input_data,
            stream_mode=["messages", "values"],
        ):
            # Process different event types
            if chunk.event == "messages/partial":
                # Streaming token from LLM - content is accumulated, not delta
                for msg in chunk.data:
                    if msg.get("type") == "ai" and msg.get("content"):
                        msg_id = msg.get("id", "default")
                        content = msg["content"]
                        prev_length = last_content_length.get(msg_id, 0)

                        # Only yield the new portion (delta)
                        if len(content) > prev_length:
                            delta = content[prev_length:]
                            last_content_length[msg_id] = len(content)
                            yield {
                                "type": "token",
                                "content": delta,
                            }

            elif chunk.event == "messages/complete":
                # Complete message
                for msg in chunk.data:
                    if msg.get("type") == "ai":
                        yield {
                            "type": "message",
                            "content": msg.get("content", ""),
                            "id": msg.get("id", ""),
                        }

            elif chunk.event == "values":
                # Final state update
                yield {
                    "type": "state",
                    "data": chunk.data,
                }

            elif chunk.event == "error":
                yield {
                    "type": "error",
                    "error": str(chunk.data),
                }
