# Important information for coding agents:

- The submodules in this repo are for **reference only** - our Svelte frontend/ contains our web app.

**deepagents** is a LangGraph library which demonstrates a `deepagent` whose capabilities can be extended with `Middleware`.  We custom-build out own agents using `create_agent()` similarly to the deepagent library.

**deep-agent-ui** is another React frontend that demonstrates a chat UI between a user and a LangGraph `deepagent` capable of tool calling.

**fullstack-chat-client** is an example React frontend for demonstrating a chat UI between a user and LangGraph agent capable of tool calling.

**cyphertap** is our fork of the repository since its `npm` library is out-of-date.  We build from and use our local submodule since it has new features not included in the origional repository.

**nutshell** is a python library which handles self-custody ecash wallets - it is used in our FastAPI backend/ to store user's funds which were spent to pay for usage of our agents.

- We always ensure to both review documentation and keep it up-to-date with code changes.  Instead of adding new files, we keep updates terse and contained in the files that reference the features.  We don't include verbose changelogs or list of refactored code elements - we simply update the existing documentation to match.