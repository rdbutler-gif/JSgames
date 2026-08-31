---
icon: rocket
---

# Getting Started

This guide walks you through everything you need to build and publish your first game on RUN.world: from installation to your first deploy.

Before you build, skim [Runtime Environment](runtime-environment.md) to see what the platform provides and what isn't allowed inside a game.

{% stepper %}
{% step %}
#### Install Node.js

You'll need version 20 or higher.

<a href="https://nodejs.org/en/download" class="button primary">Install Node.js</a>
{% endstep %}

{% step %}
#### Install the RUN.world CLI

The RUN.world CLI is what you'll use to initialize, manage, and deploy your games.

**MacOS / Linux**

Open a Terminal and run:

```bash
curl -fsSL https://github.com/series-ai/rundot-cli-releases/releases/latest/download/install.sh | bash
```

**Restart your Terminal after installation** so it can find the CLI.

**Windows**

Open PowerShell and run:

```powershell
irm https://github.com/series-ai/rundot-cli-releases/releases/latest/download/install.ps1 | iex
```
{% endstep %}

{% step %}
#### Verify installation

```bash
rundot --help
```

You should see a list of available commands. If not, see [Troubleshooting](troubleshooting.md).
{% endstep %}

{% step %}
#### Install the RUN.world SDK

From your project's root folder:

```bash
npm install @series-inc/rundot-game-sdk@latest
```

{% hint style="info" %}
The SDK is updated frequently. To update it, simply re-run the command above.
{% endhint %}
{% endstep %}

{% step %}
#### Create your game project

You have two options: start from a template, or set up a project from scratch.

**Option A: Start from a template**

Templates make it easy to get started. Pick the one that fits your game:

<a href="https://github.com/series-ai/run-template-2d-pixi-react/archive/refs/heads/main.zip" class="button primary">2D game template (pixi.js)</a>

<a href="https://github.com/series-ai/run-template-3d-react/archive/refs/heads/main.zip" class="button primary">3D game template (React)</a>

<a href="https://github.com/series-ai/run-template-2d-react/archive/refs/heads/main.zip" class="button primary">2D - UI-heavy React game template</a>

Unzip the template, open it in your code editor, and install dependencies:

```bash
npm install
```

**Option B: Build from scratch**

If you're an experienced developer and prefer setting up projects manually:

1. **Use relative file paths.** When deployed, your game is served from a subdirectory. If you use Vite, add this to `vite.config.js`:

```javascript
{
  base: './',
}
```

2. **Build to `./dist`.** The CLI looks for your build there by default. You can [customize the build path](deploying-your-game.md#advanced-options) if needed.
{% endstep %}

{% step %}
#### Initialize your game

From your project's root folder:

```bash
rundot init
```

This walks you through naming and configuring your game for the RUN.world platform. It creates a `game.config.prod.json` file that stores your game ID and build settings.

See [Initializing Your Game](initializing-your-game.md) for more details and manual options.
{% endstep %}

{% step %}
#### Test locally with Playground

Before deploying, run your game locally against the RUN.world playground backend:

```bash
npm run dev
```

For the full Vite config, dependency setup, sign-in flow, and multi-player testing instructions, see [Testing Locally With Playground](playground.md).
{% endstep %}

{% step %}
#### Deploy to RUN.world

Build and deploy your game:

```bash
npm run build
rundot deploy
```

You'll get a shareable link, playable by anyone on web or in the RUN.world app. The link is unlisted by default; no one will find it on the platform unless you publish it.

See [Deploying Your Game](deploying-your-game.md) for publishing, versioning, and advanced options.
{% endstep %}
{% endstepper %}

## Updating the CLI

The CLI will alert you when a new version is available. To update manually:

```bash
rundot update
```
