# Workspace Ticker

A GNOME Shell extension that shows a strip of workspace names at the bottom of
the screen whenever you switch workspaces. The current name is large and
centred, its neighbours smaller on either side. The strip slides to the new
workspace, holds for a moment, then fades out.

## Why this exists

GNOME's workspace switch popup shows only dots, so with more than a couple of
workspaces you count dots to learn where you landed. Space Bar lets you name
workspaces, but shows the names only in the top bar, which is not where your
eyes are right after a keyboard switch.

This puts the names where the dots would be, and nothing stays on screen
afterwards.

## How it works

Names come from **`org.gnome.desktop.wm.preferences workspace-names`**, which
Space Bar writes too. It therefore works with Space Bar, or on its own with
names set by hand. Workspaces without a name show `unnamed-format`, with
`{number}` replaced by their 1-based number.

With dynamic workspaces GNOME keeps one empty spare workspace at the end. It is
**left out of the strip unless it is the active one**, so the strip never ends
in a stray number you did not create.

### One number drives the whole strip

The strip's position is a single fractional value (1.5 is half way between the
second and third name) held in an **`St.Adjustment`**, the same mechanism
GNOME's own workspace view uses. A switch eases that value with
`EASE_OUT_CUBIC`, and on every change all labels are laid out again from it:
each label's scale falls from 1 at the position to 0.6 one step away, the
scaled labels are packed with a gap of 0.6 × the font size, and the row is
shifted so the position sits at the pill's centre. Because slide and grow come
from the same number they stay in step, and a new switch mid-animation starts
from wherever the strip currently is, with no snap back.

Names fade out over the outer 15% of the pill at each edge, so a long list is
clipped softly. The pill fades in over 100 ms and out over 250 ms.

Two details that are easy to get wrong:

- **The pill is shown before easing.** GNOME skips animations on unmapped
  actors, so easing a hidden pill's adjustment would snap instead of slide.
- **Labels are measured after `ensure_style()`.** Until the font-size style is
  resolved the width is measured at the default font, and the layout comes out
  too tight.

Labels are moved with `translation_x` and `set_scale` only, so nothing is
re-measured per frame. The pill is not reactive and is added straight to
`uiGroup`, so it never takes input or changes struts.

### Where and when it shows

It appears on the monitor you switched on, or on the primary monitor when
workspaces are primary-only. It is skipped while the **overview** is open,
which has its own workspace UI, and when that monitor has a **fullscreen**
window, which it should not cover.

## Settings

Gear icon in Extensions Manager. All are live, no logout.

| Setting | Key | Default |
|---|---|---|
| Time the strip stays up after the slide (ms, 300-5000) | `display-duration` | `1000` |
| Slide duration (ms, 0-1000; 0 jumps) | `animation-duration` | `250` |
| Distance from the bottom edge (% of monitor height, 0-50) | `bottom-offset` | `10` |
| Font size of the current name (px, 12-72) | `font-size` | `24` |
| Strip width (% of monitor width, 20-100) | `strip-width` | `40` |
| Label for unnamed workspaces | `unnamed-format` | `{number}` |

A blank `unnamed-format` falls back to the bare number, never a blank label.

## Install (development)

```bash
ln -s ~/Private/Repos/gnome_extensions/workspace-ticker \
    ~/.local/share/gnome-shell/extensions/workspace-ticker@idogr
glib-compile-schemas schemas/
```

Log out and back in (Wayland), then:

```bash
gnome-extensions enable workspace-ticker@idogr
```

## Testing

`tests/run.sh` runs the pure logic (`layout.js`, `labels.js`) under plain `gjs`.

`tools/headless/` runs the real extension in an **isolated headless GNOME
Shell** with a D-Bus driver for keys and screenshots. It never touches the real
session: private bus, private dconf, private extensions directory.

```bash
tools/headless/start.sh
tools/headless/send.sh 'key ff1b'      # the shell starts in the overview: Escape,
sleep 1                                # then wait about a second
tools/headless/send.sh 'shot /tmp/a.png'
tools/headless/stop.sh
```

To act on the headless shell from your own terminal, source `env.sh` and chain
with `&&`:

```bash
. tools/headless/env.sh && GSETTINGS_SCHEMA_DIR=$PWD/schemas \
    gsettings set org.gnome.shell.extensions.workspace-ticker font-size 36
```

- `env.sh` **fails closed**: with no active run it points the bus and runtime
  directories at nothing, so a following `gsettings` or `gnome-extensions`
  errors instead of reaching the real session. `&&` keeps that failure from
  being skipped.
- `GSETTINGS_SCHEMA_DIR=$PWD/schemas` is needed for the extension's own schema,
  which the private environment does not otherwise see.
- `stop.sh` stops only what `start.sh` started, then checks that the real
  `enabled-extensions` is unchanged and does not mention the extension, and that
  the real extensions directory has no `workspace-ticker@idogr`. It reports
  `REAL SESSION TOUCHED` otherwise.

## Known issues

- GNOME's own switcher dots can overlap the pill at the default `bottom-offset`
  on short screens (seen at 800 px tall). Raise `bottom-offset` if it bothers
  you.

## Uninstall

```bash
gnome-extensions disable workspace-ticker@idogr
rm ~/.local/share/gnome-shell/extensions/workspace-ticker@idogr
dconf reset -f /org/gnome/shell/extensions/workspace-ticker/
```

It changes no state outside itself.

## License

GPL-2.0-or-later. See [LICENSE](LICENSE).
