# Changelog

## 0.1.0 - 2026-03-26

### Added

- Initial public release of the OpenCode cmux notify plugin.
- Live cmux status updates for active OpenCode work and known subagents.
- Attention notifications for questions, permissions, retries, errors, and finished sessions.

### Fixed

- Child session lifecycle handling so stale subagent labels clear correctly.
- Root session tracking so child completion does not trigger false finished notifications.
- Activity/status cleanup so stale idle notifications are cleared when new work starts.
