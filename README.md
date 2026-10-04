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
each label's scale falls from 1 at the position to `neighbour-scale` (0.6)
one step away, its opacity from 1 to `neighbour-opacity` (1.0, no dimming), the
scaled labels are packed with a gap of 0.6 × the font size, and the row is
shifted so the position sits at the pill's centre. Because slide and grow come
from the same number they stay in step, and a new switch mid-animation starts
from wherever the strip currently is, with no snap back. With `show-number` on,
named workspaces read "2 · Name"; unnamed ones keep their format, so they never
read "4 · 4".

The pill is narrow: `strip-width-em` times the font size wide (7.5 × 24 px =
180 px by default), room for about three names. The neighbours only peek in at
the edges, so names fade out over the outer 30% of the pill at each side. The
pill fades in over 100 ms and out over 250 ms.

Under the name, a row of dots (one per workspace in the strip, so the hidden
dynamic spare gets none) shows where you are out of how many. Each dot's width
and opacity come from the same fractional position as the names, in the same
`_relayout()` call, so the wide dot moves in step with the slide. The name is
vertically centred whether the dots are on or off: the pill has equal padding
above and below (`padding` px, plus `dot-size` with dots, set inline) and the dots sit inside the
bottom padding rather than adding a row under the name. A dot is `dot-size` px high and
`dot-size` x (1 + 5/3 x k) wide (6 to 16 px by default); with `hide-inactive-dots` only the
current one is visible, its opacity following k as it slides in and out.

### Appearance

Background opacity, corner radius and inner padding always apply: `ticker.js`
sets them inline on the pill (`background-color`, `border-radius`, `padding`)
every time the labels are rebuilt, and `stylesheet.css` keeps only fallbacks.
A border (`border-width` > 0, in `border-color`) and a drop shadow (`shadow`) are added to
the same inline style. The names are clipped by the strip inside the pill, not by the pill,
so the shadow is not cut off; the border narrows the strip, and the layout centres on that.
With `blur` on, a separate actor stacked just below the pill holds clones of the wallpaper
and window groups, blurred by a `Shell.BlurEffect` (actor mode, radius `blur-radius` x the
scale factor) and cut to the pill's rounded shape by a `Clutter.ShaderEffect` at the same
radius. `Shell.BlurEffect` has no corner support, and its background mode cannot be masked, so
the panel, dock and other chrome are not part of the blur. The blur only shows through the
translucent background, so it works best with a low opacity. The effects are created once and
only updated on later rebuilds.
The radius is clamped by St to half the pill's height, so the default of 100
gives fully round ends. Colours are separate: they are off by default, and
the Appearance page's "Custom colours" expander has a switch that turns
`use-custom-colors` on, opens the section and reveals the pickers (background,
current name, neighbour names, dots). With custom colours off, the pill is
rgb(30,30,30). When on, the pill and dots get an inline background colour. Label colours are not styled: they are carried by Pango attributes on the label text, and the neighbour
colour blends into the current-name colour as a name slides into the centre,
with the same factor as the scale, and is set per frame on the label's text
actor (no restyling). Neighbour and dot colours may carry alpha; the edge fade
is separate from it.

Two details that are easy to get wrong:

- **The pill is shown before easing.** GNOME skips animations on unmapped
  actors, so easing a hidden pill's adjustment would snap instead of slide.
- **Labels are measured after `ensure_style()`.** Until the font style (size,
  family, weight) is resolved the width is measured at the default font, and the
  layout comes out too tight. Bold applies to every name, not just the current
  one, because widths are measured once per build and a weight change mid-slide
  would change a label's width.

Labels are moved with `translation_x` and `set_scale` only, so no size is
re-measured per frame (with custom colours on, a label whose colour is
changing gets a Pango re-layout, but its size does not change). The pill is not reactive and is added straight to
`uiGroup`, so it never takes input or changes struts.

### Where and when it shows

It appears on the monitor you switched on, or on the primary monitor when
workspaces are primary-only. It is skipped while the **overview** is open,
which has its own workspace UI, and when that monitor has a **fullscreen**
window, which it should not cover.

## Placement

By default the strip sits `dock-gap` pixels above the dock. It looks for Dash
to Dock's (or Ubuntu Dock's) container on the strip's monitor, and counts it as
a bottom dock when it is wider than the dash's natural height and ends at the monitor's bottom edge.
Auto-hide does not move the strip: the container collapses to nothing while
the dock is hidden, so the height used is the dock's own (dash) height, which
does not change. With no bottom dock (or
`above-dock` off) the strip uses `bottom-offset`. The dock is only read, never
changed, and is looked up again on every show.

## Settings

Gear icon in Extensions Manager. All are live, no logout.

| Setting | Key | Default |
|---|---|---|
| Time the strip stays up after the slide (ms, 300-5000) | `display-duration` | `1000` |
| Slide duration (ms, 0-1000; 0 jumps) | `animation-duration` | `250` |
| Sit above a bottom dock when there is one | `above-dock` | `true` |
| Gap between the dock's top and the strip (px, 0-200) | `dock-gap` | `12` |
| Distance from the bottom edge (% of monitor height, 0-50); used when there is no dock or `above-dock` is off | `bottom-offset` | `10` |
| Font size of the current name (px, 12-72) | `font-size` | `24` |
| Font family of the names; empty uses the theme font | `font-family` | `''` |
| Draw every name in bold | `bold-names` | `false` |
| Size of the neighbouring names (fraction of the font size, 0.3-1.0) | `neighbour-scale` | `0.6` |
| Opacity of the neighbouring names (0.2-1.0; 1.0 is no dimming) | `neighbour-opacity` | `1.0` |
| Prefix named workspaces with their number, "2 · Name" | `show-number` | `false` |
| Strip width (multiples of the font size, 4.0-20.0) | `strip-width-em` | `7.5` |
| Inner padding above and below the name (px, 0-30; `dot-size` more with dots) | `padding` | `10` |
| Corner radius of the pill (px, 0-100; larger than half the height gives round ends) | `corner-radius` | `100` |
| Show the position dots under the name | `show-dots` | `true` |
| Size of the position dots (px, 4-12) | `dot-size` | `6` |
| Show only the current dot | `hide-inactive-dots` | `false` |
| Border width of the pill (px, 0-6; 0 is none) | `border-width` | `0` |
| Border colour (may carry alpha) | `border-color` | `rgba(255,255,255,0.3)` |
| Drop shadow under the pill | `shadow` | `false` |
| Blur what is behind the pill, with rounded corners | `blur` | `false` |
| Blur strength (px, 1-100) | `blur-radius` | `30` |
| Use the colours below instead of the default colours | `use-custom-colors` | `false` |
| Pill background colour (RGB; alpha ignored) | `pill-color` | `rgb(30,30,30)` |
| Pill background opacity (0.0-1.0), always applies | `pill-opacity` | `0.4` |
| Colour of the current name | `name-color` | `rgb(255,255,255)` |
| Colour of the neighbouring names (may carry alpha) | `neighbour-color` | `rgb(255,255,255)` |
| Colour of the position dots (may carry alpha) | `dot-color` | `rgb(255,255,255)` |
| Label for unnamed workspaces | `unnamed-format` | `{number}` |

A blank `unnamed-format` falls back to the bare number, never a blank label.

## Install (development)

```bash
cd ~/Private/Repos/gnome_extensions/workspace-ticker
ln -s "$PWD" ~/.local/share/gnome-shell/extensions/workspace-ticker@idogr
glib-compile-schemas schemas/
```

Run the last command from the repo root again after every pull that changes
`schemas/`: a stale compiled schema makes a new key throw on every switch. The
install is a symlink to the working tree, so uncommitted edits go live at your
next login.

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
tools/headless/start.sh                # TICKER_WITH_DOCK=1 also loads your Dash to Dock, read-only
                                       # (then wait about 6 s before Escape)
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
  `enabled-extensions` and the real `workspace-ticker@idogr` entry (present or
  not, and its symlink target) are the same as before the run. It reports
  `REAL SESSION TOUCHED` otherwise.

## Known issues

- GNOME's own switcher dots can still overlap the pill for about a second
  after a switch. Seen in the headless shell at 1280 x 800: 0.3 s after a
  switch they sit over the pill's lower edge. With a bottom dock and the
  default `dock-gap` of 12 the overlap is only the pill's bottom 12 px (the
  name stays clear, the pill's own dots are covered). Without a dock, at the
  default `bottom-offset` of 10, they cover the lower half of the pill
  and the name. Raise `dock-gap` (to about 60) or `bottom-offset` (30 clears
  them at that size) if it bothers you.

## Uninstall

```bash
gnome-extensions disable workspace-ticker@idogr
rm ~/.local/share/gnome-shell/extensions/workspace-ticker@idogr
dconf reset -f /org/gnome/shell/extensions/workspace-ticker/
```

It changes no state outside itself.

## License

GPL-2.0-or-later. See [LICENSE](LICENSE).
