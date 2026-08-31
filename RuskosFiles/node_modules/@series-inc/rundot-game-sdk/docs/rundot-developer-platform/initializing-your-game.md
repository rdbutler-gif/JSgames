---
icon: wrench
---

# Initializing Your Game

When you want to set up your project to work with RUN.world, or if you want to make an existing project publish to a new game (like forking a project), run:

```bash
rundot init
```

This command interactively walks you through the initialization process.

{% hint style="success" %}
You can run this command on any HTML5 game project.

You can initialize any project at any time. If you have an existing game you've already been working on, you can initialize it at any time.
{% endhint %}

## Manually initialize with CLI options

You can bypass interactive mode and manually specify everything. To see options:

```bash
rundot init --help
```

## Under the hood

After initialization, a `game.config.prod.json` file is created in your project root that stores your game's configuration:

```json
{
  "gameId": "your-game-id",
  "relativePathToBuildFolder": "./dist",
  "usesPreloader": false
}
```

This makes future deployments easier by storing your game ID and build path.
