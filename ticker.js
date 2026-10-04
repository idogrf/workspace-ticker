import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {computeLayout} from './layout.js';

const FADE_IN_MS = 100;
const FADE_OUT_MS = 250;

/**
 * The pill at the bottom of the screen and the strip of names inside it.
 *
 * The strip's position is one fractional index held in an St.Adjustment —
 * the same mechanism GNOME's own workspace view uses for its scroll. Easing
 * that single value and re-laying out every label from it on each change is
 * what keeps the slide and the grow in step, and lets a new switch start
 * from wherever the strip is mid-animation.
 */
export class Ticker {
    constructor(settings) {
        this._settings = settings;
        this._labels = [];
        this._widths = [];
        this._texts = [];
        this._hideId = 0;

        // Not reactive and added straight to uiGroup rather than as chrome,
        // so it never takes input or changes struts.
        this._pill = new St.Widget({
            style_class: 'workspace-ticker-pill',
            reactive: false,
            clip_to_allocation: true,
            opacity: 0,
            visible: false,
            layout_manager: new Clutter.BinLayout(),
        });
        this._strip = new Clutter.Actor({x_expand: true, y_expand: true});
        this._pill.add_child(this._strip);
        Main.layoutManager.uiGroup.add_child(this._pill);

        this._position = new St.Adjustment({actor: this._pill, lower: 0, upper: 0, value: 0});
        this._position.connect('notify::value', () => this._relayout());
    }

    get visible() {
        return this._pill.visible;
    }

    /**
     * Shows the pill and slides the strip from `from` to `to`. While the pill
     * is already up with the same names, the slide continues from the
     * current position instead of `from`.
     */
    show(monitor, texts, from, to) {
        if (!this._pill.visible)
            this._build(monitor, texts, from);
        else if (texts.join('\n') !== this._texts.join('\n'))
            this._build(monitor, texts, Math.min(this._position.value, texts.length - 1));

        Main.layoutManager.uiGroup.set_child_above_sibling(this._pill, null);
        // Show before easing: St.Adjustment.ease runs with duration 0 while
        // its actor is unmapped, so a hidden pill would snap instead of slide.
        this._pill.show();

        const animation = this._settings.get_int('animation-duration');
        this._position.remove_transition('value');
        this._position.ease(to, {
            duration: animation,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });

        this._pill.ease({
            opacity: 255,
            duration: FADE_IN_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this._scheduleHide(animation + this._settings.get_int('display-duration'));
    }

    /** Rebuilds the strip in place and snaps to `index`, without animating. */
    refresh(monitor, texts, index) {
        this._build(monitor, texts, index);
    }

    destroy() {
        if (this._hideId) {
            GLib.source_remove(this._hideId);
            this._hideId = 0;
        }
        this._position.remove_transition('value');
        this._pill.destroy();
        this._pill = null;
        this._strip = null;
        this._labels = [];
        this._position = null;
        this._settings = null;
    }

    // Width first, because the layout centres on it; then labels; then the
    // vertical position, which depends on the label height.
    _build(monitor, texts, index) {
        const width = Math.round(monitor.width * this._settings.get_int('strip-width') / 100);
        this._pill.width = width;
        this._setLabels(texts, index);

        const [, height] = this._pill.get_preferred_height(width);
        const bottomGap = Math.round(monitor.height * this._settings.get_int('bottom-offset') / 100);
        this._pill.set_position(
            monitor.x + Math.round((monitor.width - width) / 2),
            monitor.y + monitor.height - bottomGap - height);
    }

    _setLabels(texts, index) {
        this._strip.destroy_all_children();
        const fontSize = this._settings.get_int('font-size');
        this._texts = texts;
        this._labels = texts.map(text => {
            const label = new St.Label({
                text,
                style_class: 'workspace-ticker-label',
                style: `font-size: ${fontSize}px;`,
            });
            // Scale around the centre so a shrinking label stays centred on
            // the x the layout gives it.
            label.set_pivot_point(0.5, 0.5);
            this._strip.add_child(label);
            // Resolve the font-size style now, or the width below is measured
            // at the default font and the layout comes out too tight.
            label.ensure_style();
            return label;
        });
        this._widths = this._labels.map(label => label.get_preferred_width(-1)[1]);

        this._position.remove_transition('value');
        this._position.upper = Math.max(texts.length - 1, 0);
        this._position.value = index;
        // Setting the same value emits no notify, so lay out explicitly.
        this._relayout();
    }

    // Labels are moved with translation_x and set_scale only, never by
    // changing their text or size, so nothing is re-measured per frame.
    _relayout() {
        const items = computeLayout(this._widths, this._position.value,
            this._settings.get_int('font-size'), this._pill.width);
        items.forEach(({center, scale, opacity}, i) => {
            const label = this._labels[i];
            label.translation_x = center - this._widths[i] / 2;
            label.set_scale(scale, scale);
            label.opacity = opacity;
        });
    }

    _scheduleHide(delay) {
        if (this._hideId)
            GLib.source_remove(this._hideId);
        this._hideId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._hideId = 0;
            this._pill.ease({
                opacity: 0,
                duration: FADE_OUT_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => this._pill.hide(),
            });
            return GLib.SOURCE_REMOVE;
        });
    }
}
