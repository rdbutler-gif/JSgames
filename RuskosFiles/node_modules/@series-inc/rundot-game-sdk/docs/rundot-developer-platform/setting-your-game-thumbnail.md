---
icon: image
---

# Setting Your Game Thumbnail

Your game's thumbnail is the image players see on the RUN.world Explore page, in search results, and on shared links. A good thumbnail makes your game stand out.

## How It Works

Place a file called `thumbnail.jpg` in your project's `public/` folder. **The image must be exactly 512×512 pixels**: the deploy command will fail if the dimensions are wrong.

```
my-game/
├── public/
│   └── thumbnail.jpg
├── src/
├── game.config.prod.json
└── ...
```

When you run `rundot deploy`, the CLI automatically picks up `thumbnail.jpg` from `public/` and uploads it with your build.

{% hint style="warning" %}
The deploy command will fail if you have not changed the thumbnail from the default one. Replace the default placeholder with your own `thumbnail.jpg` before deploying.
{% endhint %}

## Replacing the Default Thumbnail

Projects created from a template include a default placeholder thumbnail. You must replace it with your own image before deploying; the CLI will not allow a deploy with the default thumbnail.

## Tips

* **Dimensions:** Exactly **512×512 pixels** (required; deploy fails otherwise).
* **Keep it simple:** the thumbnail appears small in search results, so bold colors and minimal text work best.
* **Show gameplay:** screenshots or stylized game art help players understand what your game is about.
* **File format:** JPG (`.jpg`). Keep the file size reasonable for fast uploads.
