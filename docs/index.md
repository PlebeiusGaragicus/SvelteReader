# Seed

This project is a proof-of-concept which aims to use the [CypherTap](https://github.com/cypherflow/cyphertap) Svelte component to create a nostr-native website that accepts [eCash](https://cashu.space) payments.  This application will be charge 2 sats for each use in a 20 question quiz of spelling words.

## Project Requirements

The following project requirements should be strictly followed:

 * **Documentation:** This project's documentation should be kept up-to-date with code changes. It should remain terse and to-the-point without listing verbose chronological changelogs. It will be hosted on Github Pages out of the `docs/` directory and use the MKDocs format.

 * **CypherTap:** This Svelte component runs entirely in the browser and handles nostr authentication and ecash management for users.

 * **User accounts:** This website is "nostr native" where each user is identified by their "npub" or public key. Users are responsible for their own key management and wallet management. The CypherTap component is client-side and enables users to "log in" as well as handle their ecash balance.

 * **Cashu Nutshell:** This project will use its own [Cashu hot wallet](https://github.com/cashubtc/nutshell) and will not run a lightning/bitcoin node to operate as a proper mint. Payments from the users will be redeemed immediately and withdrawn to a lightning address periodically, if over a threashold.

 * **Frontend:** This will be build using Svelte 5 + tailwindcss + Vite. It should be responsive and default to dark mode. The CypherTap's dark mode toggle should be used to change the app's appearance.

 * **Backend:** This will be built using Python 3.12+ and FastAPI.

 * **Pay-Per-Use:** Instead of subscriptions, users will pay for their usage using eCash tokens. These bearer assets will be sent along with API requests to the backend to be redeemed and verified before processing a user's request, returning an HTTP 402 error if verification fails.

 * **AI Integration:** This feature will be designed after all other features are completed.  We will use OpenAI-compatible endpoints which will run inference on our own infrastructure. We do not use OpenAI and will not auto-fill our defaults with their model names.

---

## SvelteReader Features

This is an ebook reader that allows users to highlight, annotate and ask AI questions about the text.

 * **Top Bar:** This simple bar contains the CypherTap component on the right, a centered "SvelteReader" title.  In reading mode it displays icons to navigate collapse the annotation sidebar, and a table of contents icon to open a modal with a table of contents.

 * **Landing Page:** This is a library view with cards that display the user's ebooks, book reading progress and a "..." menu to access additional options (Delete, Mark as Read, etc.)

 * **Book View:** This is a reading view with a collapsible side panel that displays the user's annotations and highlights for the current book.  It also displays a collapsible sidebar that contains a table of contents for the book.
