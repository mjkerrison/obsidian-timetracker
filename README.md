# Time Tracker for Obsidian

A focused time tracking plugin with two views: a week-view calendar for retrospective entry and a live capture view with pomodoro timer.

## Features

### Week View

A visual calendar grid for viewing and editing time entries.

- **15-minute granularity** - Each row represents a 15-minute slot
- **Click and drag** to paint new entries, then type a description
- **Double-click** existing entries to edit their description
- **Click to select** an entry, then press **Delete** or **Backspace** to remove it
- **Drag edges** to resize entries (change start/end times)
- **Drag body** to move entries to different times
- **Smooth navigation** - Day buttons slide the viewport continuously; week buttons snap to calendar-aligned weeks
- **Today highlighting** - Current day is visually highlighted
- **Working hours shading** - Configurable hours (default 9-5) are subtly shaded on weekdays

### Live Capture View

A timer interface for real-time time tracking.

- **Stopwatch mode** - Start/stop to track time as you work
- **Pomodoro mode** - Work/break cycles with configurable durations
- **Quick offset buttons** - "Started X minutes ago" for retroactive entries (5, 10, 15, 30 min by default)
- **Today's total** - See how much time you've tracked today
- **Sound notifications** - Audio alert when timers complete
- **System notifications** - Desktop notifications for timer events

### Data Storage

All entries are stored in a single markdown file (default: `time-tracking.md`) using a human-readable format:

```
2025-01-21 11:00 - 12:30 | Meeting with team #work
2025-01-21 14:00 - 14:25 | Deep work on feature #dev (pomodoro)
2025-01-21 14:25 - 14:30 | Break
```

- **Line-based editing** - The plugin only modifies entry lines, preserving any other content (comments, blank lines, headers) in your file
- **Tags** - Add `#tags` to categorize entries
- **Markers** - `(pomodoro)` and `(break)` markers are added automatically

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| File path | `time-tracking.md` | Where to store time entries |
| Week start day | Monday | First day of the calendar week |
| Working hours start | `09:00` | Start of working hours (shaded on weekdays) |
| Working hours end | `17:00` | End of working hours (shaded on weekdays) |
| Pomodoro work minutes | 25 | Duration of work sessions |
| Pomodoro break minutes | 5 | Duration of short breaks |
| Pomodoro long break minutes | 15 | Duration of long breaks |
| Pomodoros before long break | 4 | Work sessions before a long break |
| Sound enabled | true | Play sounds on timer completion |
| Notifications enabled | true | Show system notifications |
| Quick offsets | 5, 10, 15, 30 | Minutes for quick-start buttons |

## Installation

### Manual Installation

1. Download the latest release
2. Extract to your vault's `.obsidian/plugins/time-tracker/` directory
3. Enable the plugin in Obsidian settings

### Development

```bash
npm install
npm run dev    # Watch mode
npm run build  # Production build
```

## Usage

1. Open the command palette and search for "Time Tracker"
2. Use "Open Week View" to see the calendar grid
3. Use "Open Live Capture" for timer-based tracking
4. Click and drag on the week view to create entries
5. Use the Live Capture view's timer or quick-start buttons for real-time tracking

## License

MIT
