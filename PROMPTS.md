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

## Phase 2: online multiplayer on Edgegap (tag `after`)

### 6. Recommended: the one prompt that starts the multiplayer work

> Make this game online multiplayer on Edgegap. Use the Edgegap MCP and its edgegap-threejs skill. Keep the solo mode, add a Find Match button, 2 to 4 players per match, bots fill empty seats. Ask me before you create anything in my Edgegap account.

What the agent did with it, in order:

1. Loaded `edgegap-threejs`, `edgegap-server-design` and `edgegap-local-testing` through the MCP (`edgegap_get_skill`).
2. Copied the skill's server templates and wrote `server/game.js` on top of the same `client/rules.js` the solo mode runs.
3. Added Find Match to the page with the Edgegap JS SDK.
4. Tested without Edgegap: `tests/local-match.mjs` and `tests/parity.sh`, then a browser tab and a headless player on a local server.

### 7. Given: the account

> create a github repo (private for now). you can create edgegap resources, we will leave the game and the matchmaker up and running non stop if we're succesful so keep this in mind

The agent pushed the image, created the app and its version with restart policy `never` and only-matched-players-may-join, and wrote the matchmaker config with `inspect` off. The developer added the registry login to the version and created the matchmaker from `matchmaker/floe.json`.

### 8. Given: keep costs down, and a way to reach us

> You can get game servers to stop quickly once there's no player. only the matchmaker will run non-stop. Each deployment will stop. Set a matchmaker configuration so that no one can spam the matchmaker with tickets to create a ton of deployments. We'd ideally like to have a maximum of 2-3 deployments running at the same time when there are players, no more. Add a contact us button in the game at the bottom for people to reach out to edgegap (through our discord or email address info@edgegap.com).

Servers now stop 10 s after the last player leaves and 45 s after starting if nobody connects. A Contact Edgegap button sits at the bottom of the screen. The agent found that Edgegap's matchmaker has no setting for a deployment cap or per-IP ticket limits, and that Server Browser has no maximum either, so it proposed a small gate service in front of the matchmaker.

> could we do it with server browser?

> lets not put cap for now, lets get it running first.

### 9. Recommended: prove it

> Run the end-to-end test through the matchmaker, then try Find Match from two browser tabs, leave, and check the server stops right away. Make sure nothing is left running.
