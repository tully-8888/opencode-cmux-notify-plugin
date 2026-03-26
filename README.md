# opencode-cmux-notify-plugin

An OpenCode plugin that integrates with [cmux](https://github.com/manaflow-ai/cmux) to show live OpenCode activity in the sidebar and send attention notifications when OpenCode needs you.

It adds:

- live cmux status for active OpenCode work
- active subagent names when they are known
- question and permission attention notifications
- retry, error, and finished notifications
- automatic status clearing when work is no longer active

## Requirements

- [OpenCode](https://opencode.ai/)
- [`cmux`](https://github.com/manaflow-ai/cmux) installed and available on your `PATH`

## Installation

### From npm in `opencode.json`

After publishing, add the package name to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-cmux-notify-plugin"]
}
```

OpenCode installs npm plugins automatically using Bun at startup.

### From a local file

If you want to install it without npm, copy the plugin file into your OpenCode plugins directory:

```bash
mkdir -p ~/.config/opencode/plugins
cp opencode-cmux-notify.js ~/.config/opencode/plugins/
```

OpenCode will load local plugins from that directory automatically.

## Usage

Once loaded, the plugin automatically reacts to OpenCode session events. No additional registration step is required.

## What it does

- Uses `cmux set-status` / `clear-status` for live activity
- Uses `cmux notify` for attention-worthy events
- Clears stale cmux notifications when new OpenCode activity begins
- Tracks child subagent lifecycle so finished agent labels disappear
- Prioritizes pending questions over ordinary busy status when multiple sessions exist

## Event behavior

- `question.asked` → shows `Needs answer: ...` and sends a notification
- `permission.asked` → sends a permission notification
- `session.status` busy/retry → shows active status in cmux
- child subagent sessions → shows inline subagent names like `⏳ oracle, ⏳ explore`
- `session.error` → sends an error notification
- root `session.idle` → clears active status and sends a finish notification

## Troubleshooting

- If you do not see updates, make sure `cmux` is installed and callable from the same shell environment OpenCode uses.
- If notifications look stale, restart OpenCode once after updating the plugin so the latest lifecycle logic is loaded.
- If you use multiple OpenCode sessions, the shared cmux status shows the most relevant active root session, prioritizing pending questions.

## Development

This plugin is intentionally build-free and ESM-only. The repo keeps a single runtime file so installation stays simple.

## Publish notes

- npm package name: `opencode-cmux-notify-plugin`
- OpenCode config entry: `"plugin": ["opencode-cmux-notify-plugin"]`
- Requires `cmux` to be installed and available on `PATH`

## License

MIT
