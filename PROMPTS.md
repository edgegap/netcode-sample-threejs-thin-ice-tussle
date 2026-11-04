# Prompts

Everything in this repo was written by an AI agent (Claude Code, model Claude Opus 5.5) with the Edgegap MCP server connected. This file lists the prompts in order.

There are two kinds of entries:

- **Given**: what the developer actually typed.
- **Recommended**: the short prompt a vibe coder would type to get the same step. The work happened in the same session, and the agent wrote down the prompt that matches each change so you can replay it on your own game.

## Phase 1: the single-player game (tag `before`)

### 1. Given: pick a game

> what other small web games could we vibe code from scratch and add multiplayer?

> which one of those is latency sensitive

> lets make shrinking ice floe

Shrinking Ice Floe was picked because it holds up on mobile data: the ice is slippery anyway, so the extra delay of an authoritative server barely shows.

### 2. Recommended: start the game

> Make a small 3D browser game with Three.js, plain HTML and JS, no build step, Three.js from a CDN. Cute round penguin-like characters on a sheet of hexagonal ice tiles floating in the sea. The ice cracks from the edge inward, shaking tiles drop into the water a second later. The controls feel slippery, like ice. A slide button makes you belly-slide forward and shove anyone you hit. Last one standing wins the round, first to 4 rounds wins. Me against 3 bots. It has to work on my phone and on desktop. Make all the 3D models in code.

### 3. Recommended: make it more fun

> Add a golden fish that shows up now and then on the ice: grab it and your next slide is a mega shove. After 20 seconds, holes should start appearing anywhere, not just at the edge, and the ice should break faster the longer a round lasts.

### 4. Recommended: bots and look

> The bots should avoid shaking ice and holes, and slide into me when I'm close to the edge. Make it a bright sunny look: white ice, blue sea, colourful penguins with names over their heads. Show round wins as dots next to each name.

### 5. Recommended: phone fixes

> On my phone the penguins are tiny and the camera cuts off the ice. Pull the camera back so the whole sheet fits, make the penguins bigger, and add a thumb-stick and a big SLIDE button.
