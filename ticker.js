// SPDX-License-Identifier: GPL-2.0-or-later
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {computeLayout, GAP_RATIO} from './layout.js';

const FADE_IN_MS = 100;
const FADE_OUT_MS = 250;

// Shell.BlurEffect blurs its actor's whole rectangle and has no corner support,
// so a shader after it zeroes the alpha outside the corner arcs (half-pixel
// feather centred on the edge). Clutter.ShaderEffect.set_shader_source exists in GNOME 48-50.
const CornerMaskEffect = GObject.registerClass(
class CornerMaskEffect extends Clutter.ShaderEffect {
    constructor() {
        super();
        this.set_shader_source(`
            uniform sampler2D tex;
            uniform float width;
            uniform float height;
            uniform float radius;

            void main() {
                vec2 size = vec2(width, height);
                vec2 uv = cogl_tex_coord_in[0].xy;
                vec2 d = max(vec2(radius) - min(uv * size, size - uv * size), vec2(0.0));
                float a = clamp(radius + 0.5 - length(d), 0.0, 1.0);
                cogl_color_out = texture2D(tex, uv) * a;
            }
        `);
    }
});

// Parses a CSS colour string to 0-255 channels, or the fallback on failure.
function parseColor(str, fallback) {
    const [ok, c] = Cogl.Color.from_string(str);
    return ok ? [c.red, c.green, c.blue, c.alpha] : fallback;
}

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
        this._dots = [];
        this._widths = [];
        this._texts = [];
        this._hideId = 0;
        this._pinned = false;
        this._custom = false;
        this._nameColor = null;
        this._neighbourColor = null;
        this._monitor = null;
        // Font size in actor px (settings value times the theme scale factor),
        // cached so _relayout reads no setting per frame.
        this._fontPx = 0;
        this._scale = 1;
        // Neighbour options, cached with the font size so _relayout reads no
        // setting per frame.
        this._neighbourScale = 0.6;
        this._neighbourOpacity = 1;
        // Dot options, cached for _relayout.
        this._dotSize = 6;
        this._hideInactiveDots = false;
        this._innerWidth = 0;
        this._blurActor = null;
        this._blurInner = null;
        this._blurEffect = null;
        this._maskEffect = null;
        this._windowClone = null;
        this._blurBindings = [];
        this._blurClones = [];
        this._blurOffset = [0, 0];
        this._blurUiId = 0;

        // Not reactive and added straight to uiGroup rather than as chrome,
        // so it never takes input or changes struts.
        this._pill = new St.Widget({
            style_class: 'workspace-ticker-pill',
            reactive: false,
            opacity: 0,
            visible: false,
            layout_manager: new Clutter.BinLayout(),
        });
        // The strip clips the names at the pill's edges, not the pill, so the
        // pill's own drop shadow is not cut off. Horizontal padding is 0, so
        // the strip spans the pill's width inside the border.
        this._strip = new Clutter.Actor({
            x_expand: true,
            y_expand: true,
            clip_to_allocation: true,
        });
        this._pill.add_child(this._strip);
        // Pinned to the bottom, inside the pill's bottom padding, so it never
        // moves the name off the vertical centre. The pill's padding shrinks
        // the area a child is laid out in, so _setLabels pushes the row down
        // by the effective padding to sit 5px above the pill's inner bottom edge
        // (the content box already excludes the border).
        this._dotRow = new St.BoxLayout({
            style: 'spacing: 6px;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END,
            y_expand: true,
        });
        this._pill.add_child(this._dotRow);
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
        else if (monitor !== this._monitor || texts.join('\n') !== this._texts.join('\n'))
            this._build(monitor, texts, Math.min(this._position.value, texts.length - 1));

        // Above ordinary windows and chrome but below modal dialogs, DnD
        // feedback and screen transitions, which sit above modalDialogGroup.
        Main.layoutManager.uiGroup.set_child_below_sibling(this._pill,
            Main.layoutManager.modalDialogGroup);
        if (this._blurActor) {
            Main.layoutManager.uiGroup.set_child_below_sibling(this._blurActor, this._pill);
            this._cloneSwitchGroups();
        }
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

    /** Keeps the pill up: no hide timer runs until `unpin()`. */
    pin() {
        this._pinned = true;
        if (this._hideId) {
            GLib.source_remove(this._hideId);
            this._hideId = 0;
        }
    }

    /** Lets the pill go: schedules the normal fade-out. */
    unpin() {
        this._pinned = false;
        if (this._pill.visible)
            this._scheduleHide(this._settings.get_int('display-duration'));
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
        this._removeBlur();
        this._pill.destroy();
        this._pill = null;
        this._strip = null;
        this._dotRow = null;
        this._labels = [];
        this._dots = [];
        this._position = null;
        this._settings = null;
    }

    // Width first, because the layout centres on it; then labels; then the
    // vertical position, which depends on the label height.
    _build(monitor, texts, index) {
        this._monitor = monitor;
        // St scales CSS px (padding, font-size, dot height) by this factor;
        // the px quantities set from code must match.
        this._scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._fontPx = this._settings.get_int('font-size') * this._scale;
        const width = Math.round(this._settings.get_double('strip-width-em') * this._fontPx);
        this._pill.width = width;
        this._setLabels(texts, index);

        const [, height] = this._pill.get_preferred_height(width);
        const x = monitor.x + Math.round((monitor.width - width) / 2);
        const y = this._bottomEdge(monitor) - height;
        this._pill.set_position(x, y);
        this._applyBlur(x, y, width, height);
    }

    // Shell.BlurEffect in BACKGROUND mode reads the framebuffer behind its
    // actor, which a rounded-corner mask (an offscreen effect) would hide, and
    // it paints the whole rectangle, so it cannot be masked. Instead the blur
    // blurs a clone of the window group (wallpaper included) in ACTOR mode; panel,
    // dock and other chrome are not in it. Structure, below the pill so its
    // shadow is not masked: a pill-sized clipping actor carrying the corner
    // mask (its clip keeps the mask's texture exactly pill-sized, whatever the
    // blur's own paint volume), holding a larger actor with the blur and the
    // clones; the larger actor reaches `margin` px past the pill so the pill's
    // edges blur against real content, not transparency. The pill's
    // visibility and opacity are bound to the clipping actor.
    // Created once while blur is on; later builds only move and update it.
    _applyBlur(x, y, width, height) {
        if (!this._settings.get_boolean('blur')) {
            this._removeBlur();
            return;
        }
        if (!this._blurActor) {
            this._blurActor = new Clutter.Actor({clip_to_allocation: true});
            this._maskEffect = new CornerMaskEffect();
            this._blurActor.add_effect(this._maskEffect);
            this._blurInner = new Clutter.Actor({clip_to_allocation: true});
            this._blurEffect = new Shell.BlurEffect({
                mode: Shell.BlurMode.ACTOR,
                brightness: 1.0,
            });
            this._blurInner.add_effect(this._blurEffect);
            this._blurActor.add_child(this._blurInner);
            this._windowClone = new Clutter.Clone({source: global.window_group});
            this._blurInner.add_child(this._windowClone);
            Main.layoutManager.uiGroup.insert_child_below(this._blurActor, this._pill);
            this._blurBindings = ['visible', 'opacity'].map(prop =>
                this._pill.bind_property(prop, this._blurActor, prop,
                    GObject.BindingFlags.SYNC_CREATE));
            this._blurUiId = Main.layoutManager.uiGroup.connect('child-added',
                () => this._cloneSwitchGroups());
            this._cloneSwitchGroups();
        }
        const blurRadius = this._settings.get_int('blur-radius') * this._scale;
        const margin = Math.ceil(blurRadius * 2);
        this._blurActor.set_position(x, y);
        this._blurActor.set_size(width, height);
        this._blurInner.set_position(-margin, -margin);
        this._blurInner.set_size(width + 2 * margin, height + 2 * margin);
        // Clones are placed so the scene lines up with the stage.
        this._blurOffset = [-(x - margin), -(y - margin)];
        this._windowClone.set_position(...this._blurOffset);
        this._blurClones.forEach(({constraints}) =>
            constraints.forEach((c, i) => c.set_offset(this._blurOffset[i])));
        this._blurEffect.radius = blurRadius;
        // Same clamp St applies to the pill's border-radius. Nudged off whole
        // numbers so GJS marshals doubles for the float uniforms.
        const radius = Math.max(Math.min(this._settings.get_int('corner-radius') * this._scale,
            width / 2, height / 2), 0.5);
        this._maskEffect.set_uniform_value('width', width - 1e-6);
        this._maskEffect.set_uniform_value('height', height - 1e-6);
        this._maskEffect.set_uniform_value('radius', radius - 1e-6);
    }

    // While a workspace switch animates, the shell puts an opaque MonitorGroup
    // (style class 'workspace-animation') above window_group, and mutter has
    // already activated the target workspace, so window_group alone would show
    // the destination during the slide. Clone each such group above the window
    // clone, bound to its position, so the blur follows the slide. Called when
    // the blur is created, in show(), and for every new uiGroup child.
    _cloneSwitchGroups() {
        if (!this._blurInner)
            return;
        for (const source of Main.layoutManager.uiGroup.get_children()) {
            if (!source.has_style_class_name?.('workspace-animation') ||
                this._blurClones.some(c => c.source === source))
                continue;
            const clone = new Clutter.Clone({source});
            const constraints = [Clutter.BindCoordinate.X, Clutter.BindCoordinate.Y].map(
                (coordinate, i) => new Clutter.BindConstraint({
                    source, coordinate, offset: this._blurOffset[i],
                }));
            constraints.forEach(c => clone.add_constraint(c));
            clone.add_constraint(new Clutter.BindConstraint({
                source, coordinate: Clutter.BindCoordinate.SIZE,
            }));
            this._blurInner.add_child(clone);
            const entry = {source, clone, constraints, id: 0};
            entry.id = source.connect('destroy', () => {
                this._blurClones = this._blurClones.filter(c => c !== entry);
                clone.destroy();
            });
            this._blurClones.push(entry);
        }
    }

    _removeBlur() {
        if (this._blurUiId) {
            Main.layoutManager.uiGroup.disconnect(this._blurUiId);
            this._blurUiId = 0;
        }
        this._blurClones.forEach(({source, id}) => source.disconnect(id));
        this._blurClones = [];
        this._blurBindings.forEach(binding => binding.unbind());
        this._blurBindings = [];
        this._blurActor?.destroy();
        this._blurActor = null;
        this._blurInner = null;
        this._blurEffect = null;
        this._maskEffect = null;
        this._windowClone = null;
    }

    // Pill bottom in stage coordinates: above a bottom dock when asked to,
    // else bottom-offset percent up from the monitor's bottom.
    _bottomEdge(monitor) {
        if (this._settings.get_boolean('above-dock')) {
            const dockTop = this._dockTop(monitor);
            if (dockTop !== null)
                return dockTop - this._settings.get_int('dock-gap');
        }
        return monitor.y + monitor.height -
            Math.round(monitor.height * this._settings.get_int('bottom-offset') / 100);
    }

    // Top of Dash to Dock's (or Ubuntu Dock's) bottom dock on this monitor, or
    // null. Only public geometry is read. The container is not measured for
    // height: while the dock is auto-hidden it collapses to 0 tall at the
    // monitor's bottom (checked in the headless shell), which would make the
    // pill jump down. The dash's natural height is the same whether the dock
    // is shown or hidden.
    _dockTop(monitor) {
        const monitors = Main.layoutManager.monitors;
        const dock = Main.layoutManager.uiGroup.get_children().find(actor =>
            actor.name === 'dashtodockContainer' &&
            monitors[actor.monitorIndex] === monitor);
        if (!dock || !dock.dash)
            return null;
        const [, y] = dock.get_transformed_position();
        const [w, h] = dock.get_transformed_size();
        const [, dashHeight] = dock.dash.get_preferred_height(-1);
        if (w <= dashHeight || Math.abs(y + h - (monitor.y + monitor.height)) > 2)
            return null;
        return monitor.y + monitor.height - dashHeight;
    }

    _setLabels(texts, index) {
        this._strip.destroy_all_children();
        const fontSize = this._settings.get_int('font-size');
        this._neighbourScale = this._settings.get_double('neighbour-scale');
        this._neighbourOpacity = this._settings.get_double('neighbour-opacity');
        const family = this._settings.get_string('font-family');
        let style = `font-size: ${fontSize}px;`;
        if (family)
            style += ` font-family: "${family.replace(/["\\\n\r;]/g, '')}";`;
        if (this._settings.get_boolean('bold-names'))
            style += ' font-weight: bold;';
        // The current name is full size, so it must fit the pill with a gap
        // either side; anything longer is ellipsized.
        // The border narrows the strip, so measure against its width.
        this._innerWidth = this._pill.width -
            2 * this._settings.get_int('border-width') * this._scale;
        const cap = Math.max(this._innerWidth - 2 * GAP_RATIO * this._fontPx, 1);
        this._texts = texts;
        this._labels = texts.map(text => {
            const label = new St.Label({
                text,
                style_class: 'workspace-ticker-label',
                style,
            });
            // Scale around the centre so a shrinking label stays centred on
            // the x the layout gives it.
            label.set_pivot_point(0.5, 0.5);
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            this._strip.add_child(label);
            // Resolve the font-size style now, or the width below is measured
            // at the default font and the layout comes out too tight.
            label.ensure_style();
            if (label.get_preferred_width(-1)[1] > cap)
                label.set_width(cap);
            return label;
        });
        this._widths = this._labels.map(label => label.get_preferred_width(-1)[1]);

        const showDots = this._settings.get_boolean('show-dots');
        const dotSize = this._settings.get_int('dot-size');
        this._dotSize = dotSize;
        this._hideInactiveDots = this._settings.get_boolean('hide-inactive-dots');
        const padding = this._settings.get_int('padding') + (showDots ? dotSize : 0);
        this._dotRow.margin_bottom = 5 * this._scale;
        this._dotRow.translation_y = showDots ? padding * this._scale : 0;
        this._dotRow.destroy_all_children();
        this._dots = showDots ? texts.map(() => {
            const dot = new St.Widget({style_class: 'workspace-ticker-dot'});
            this._dotRow.add_child(dot);
            return dot;
        }) : [];

        this._applyColors(padding);

        this._position.remove_transition('value');
        this._position.upper = Math.max(texts.length - 1, 0);
        this._position.value = index;
        // Setting the same value emits no notify, so lay out explicitly.
        this._relayout();
    }

    // Pill and dots get an inline style here, once. Label colours are not
    // styled: they are parsed and lerped per frame in _relayout, because
    // set_style would re-resolve the theme node on every frame. Called only
    // from _setLabels, so a style change never resets the text colour
    // mid-animation. Opacity, radius and padding always apply; colours only
    // with custom colours on.
    _applyColors(padding) {
        this._custom = this._settings.get_boolean('use-custom-colors');
        const [r, g, b] = this._custom
            ? parseColor(this._settings.get_string('pill-color'), [30, 30, 30])
            : [30, 30, 30];
        const opacity = this._settings.get_double('pill-opacity');
        const radius = this._settings.get_int('corner-radius');
        let style = `background-color: rgba(${r},${g},${b},${opacity}); ` +
            `border-radius: ${radius}px; padding: ${padding}px 0;`;
        const borderWidth = this._settings.get_int('border-width');
        if (borderWidth > 0) {
            const [br, bg, bb, ba] = parseColor(this._settings.get_string('border-color'),
                [255, 255, 255, 77]);
            style += ` border: ${borderWidth}px solid rgba(${br},${bg},${bb},${ba / 255});`;
        }
        if (this._settings.get_boolean('shadow'))
            style += ' box-shadow: 0 2px 10px rgba(0,0,0,0.5);';
        this._pill.set_style(style);

        // Size and shape of every dot, merged with the custom colour.
        let dotStyle = `height: ${this._dotSize}px; border-radius: ${this._dotSize / 2}px;`;
        if (this._custom) {
            const [dr, dg, db, da] = parseColor(this._settings.get_string('dot-color'),
                [255, 255, 255, 255]);
            dotStyle += ` background-color: rgba(${dr},${dg},${db},${da / 255});`;
        }
        this._dots.forEach(dot => dot.set_style(dotStyle));
        if (!this._custom)
            return;
        this._nameColor = parseColor(this._settings.get_string('name-color'),
            [255, 255, 255, 255]);
        this._neighbourColor = parseColor(this._settings.get_string('neighbour-color'),
            [255, 255, 255, 255]);
        // The pill's new style invalidates its children's theme nodes, and St
        // resets a label's text colour when they re-resolve. Resolve them now
        // so that happens before _relayout sets the colours, not after.
        this._pill.ensure_style();
        this._labels.forEach(label => label.ensure_style());
    }

    // Labels are moved with translation_x and set_scale only, never by
    // changing their text or size, so nothing is re-measured per frame.
    _relayout() {
        const items = computeLayout(this._widths, this._position.value,
            this._fontPx, this._innerWidth, {
                neighbourScale: this._neighbourScale,
                neighbourOpacity: this._neighbourOpacity,
            });
        items.forEach(({center, scale, opacity}, i) => {
            const label = this._labels[i];
            label.translation_x = center - this._widths[i] / 2;
            label.set_scale(scale, scale);
            label.opacity = opacity;
        });

        // Neighbour colour blends to the name colour with the same k as the
        // scale and the dots.
        if (this._custom) {
            const p = this._position.value;
            this._labels.forEach((label, i) => {
                const k = Math.max(0, 1 - Math.abs(i - p));
                const [n, m] = [this._neighbourColor, this._nameColor];
                const mix = c => Math.round(n[c] + (m[c] - n[c]) * k);
                // clutter_text.color is not enough: St gives the text a Pango
                // foreground attribute from the theme, which wins over it.
                // Skip unchanged colours: new attributes dirty the layout.
                // Labels are rebuilt in _setLabels, so the cache resets there.
                const key = `${mix(0)},${mix(1)},${mix(2)},${mix(3)}`;
                if (label._colorKey === key)
                    return;
                label._colorKey = key;
                const attrs = new Pango.AttrList();
                attrs.insert(Pango.attr_foreground_new(mix(0) * 257, mix(1) * 257, mix(2) * 257));
                attrs.insert(Pango.attr_foreground_alpha_new(mix(3) * 257));
                label.clutter_text.attributes = attrs;
            });
        }

        // Same fractional position as the names, so the wide dot slides in step.
        const p = this._position.value;
        this._dots.forEach((dot, i) => {
            const k = Math.max(0, 1 - Math.abs(i - p));
            dot.width = this._dotSize * (1 + 5 / 3 * k) * this._scale;
            dot.opacity = Math.round(255 * (this._hideInactiveDots ? k : 0.4 + 0.6 * k));
        });
    }

    _scheduleHide(delay) {
        if (this._hideId)
            GLib.source_remove(this._hideId);
        if (this._pinned) {
            this._hideId = 0;
            return;
        }
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
