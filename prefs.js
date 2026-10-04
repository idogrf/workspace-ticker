// SPDX-License-Identifier: GPL-2.0-or-later
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class WorkspaceTickerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        this._handlerIds = [];

        window.add(this._generalPage(settings));
        window.add(this._appearancePage(settings));
        // The settings object outlives the window, so drop the handlers
        // that point at its widgets.
        window.connect('close-request', () => {
            settings.set_boolean('preview', false);
            this._handlerIds.forEach(id => settings.disconnect(id));
            this._handlerIds = [];
            return false;
        });
        // Keeps the pill up while the window is open, so changes show live.
        settings.set_boolean('preview', true);
    }

    _spinRow(settings, key, title, subtitle, lower, upper, step) {
        const row = new Adw.SpinRow({
            title,
            subtitle,
            adjustment: new Gtk.Adjustment({
                lower,
                upper,
                step_increment: step,
                page_increment: step * 10,
            }),
        });
        settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _generalPage(settings) {
        const timing = new Adw.PreferencesGroup({
            title: 'Timing',
            description: 'Changes apply right away — no need to log out.',
        });
        timing.add(this._spinRow(settings, 'display-duration', 'Display duration',
            'Milliseconds the strip stays up after sliding, before it fades.',
            300, 5000, 50));
        timing.add(this._spinRow(settings, 'animation-duration', 'Slide duration',
            'Milliseconds the slide to the new workspace takes. 0 jumps.',
            0, 1000, 25));

        const placement = new Adw.PreferencesGroup({title: 'Placement'});
        const aboveDockRow = new Adw.SwitchRow({title: 'Sit above the dock'});
        settings.bind('above-dock', aboveDockRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        placement.add(aboveDockRow);
        const gapRow = this._spinRow(settings, 'dock-gap', 'Gap above dock',
            'Pixels between the top of the dock and the strip.',
            0, 200, 1);
        settings.bind('above-dock', gapRow, 'sensitive', Gio.SettingsBindFlags.GET);
        placement.add(gapRow);
        placement.add(this._spinRow(settings, 'bottom-offset', 'Distance from bottom',
            'Percent of the screen height between the bottom edge and the strip. ' +
            'Applies when there is no dock, or "Sit above the dock" is off.',
            0, 50, 1));

        const naming = new Adw.PreferencesGroup({
            title: 'Unnamed workspaces',
            description: '{number} is replaced with the workspace number. ' +
                'Leave blank to show just the number.',
        });
        const formatRow = new Adw.EntryRow({title: 'Label format'});
        settings.bind('unnamed-format', formatRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        naming.add(formatRow);

        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });
        page.add(timing);
        page.add(placement);
        page.add(naming);
        return page;
    }

    _appearancePage(settings) {
        const page = new Adw.PreferencesPage({
            title: 'Appearance',
            icon_name: 'applications-graphics-symbolic',
        });
        page.add(this._sizeGroup(settings));
        page.add(this._textGroup(settings));
        page.add(this._backgroundGroup(settings));
        page.add(this._dotsGroup(settings));
        page.add(this._coloursGroup(settings));
        return page;
    }

    _sizeGroup(settings) {
        const group = new Adw.PreferencesGroup({title: 'Size'});
        group.add(this._spinRow(settings, 'font-size', 'Font size',
            'Pixels, for the current name. Neighbours are scaled from it.',
            12, 72, 1));
        const widthRow = this._spinRow(settings, 'strip-width-em', 'Strip width',
            'Multiples of the font size. 7.5 fits about three names.',
            4, 20, 0.5);
        widthRow.digits = 1;
        group.add(widthRow);
        group.add(this._spinRow(settings, 'padding', 'Inner padding',
            'Pixels above and below the name.',
            0, 30, 1));
        group.add(this._spinRow(settings, 'corner-radius', 'Corner radius',
            'Pixels. 100 gives fully round ends.',
            0, 100, 1));
        return group;
    }

    _textGroup(settings) {
        const group = new Adw.PreferencesGroup({title: 'Text'});

        const fontButton = new Gtk.FontDialogButton({
            dialog: new Gtk.FontDialog(),
            level: Gtk.FontLevel.FAMILY,
            valign: Gtk.Align.CENTER,
        });
        // Empty means the theme font, which the button shows until a family
        // is picked.
        let loading = false;
        const loadFont = () => {
            loading = true;
            setFont();
            loading = false;
        };
        const setFont = () => {
            const family = settings.get_string('font-family');
            if (family === '') {
                fontButton.font_desc = Pango.FontDescription.from_string(
                    Gtk.Settings.get_default().gtk_font_name);
                return;
            }
            const desc = new Pango.FontDescription();
            desc.set_family(family);
            if (fontButton.font_desc?.get_family() !== desc.get_family())
                fontButton.font_desc = desc;
        };
        loadFont();
        fontButton.connect('notify::font-desc', () => {
            if (loading)
                return;
            const family = fontButton.font_desc?.get_family() ?? '';
            if (family !== '' && family !== settings.get_string('font-family'))
                settings.set_string('font-family', family);
        });
        this._handlerIds.push(settings.connect('changed::font-family', loadFont));
        const resetButton = new Gtk.Button({
            icon_name: 'edit-clear-symbolic',
            tooltip_text: 'Reset',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        resetButton.connect('clicked', () => settings.set_string('font-family', ''));
        const fontRow = new Adw.ActionRow({
            title: 'Font',
            subtitle: 'Family of the names. Reset uses the theme font.',
            activatable_widget: fontButton,
        });
        fontRow.add_suffix(fontButton);
        fontRow.add_suffix(resetButton);
        group.add(fontRow);

        const boldRow = new Adw.SwitchRow({title: 'Bold names'});
        settings.bind('bold-names', boldRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(boldRow);

        group.add(this._percentRow(settings, 'neighbour-scale', 'Neighbour size',
            'Percent of the font size.', 30, 100));
        group.add(this._percentRow(settings, 'neighbour-opacity', 'Neighbour opacity',
            'Percent. Below 100 dims the names beside the current one.', 20, 100));

        const numberRow = new Adw.SwitchRow({
            title: 'Show workspace number',
            subtitle: 'Prefixes named workspaces as "2 · Name".',
        });
        settings.bind('show-number', numberRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(numberRow);
        return group;
    }

    // A 0-1 double setting shown as a percent SpinRow.
    _percentRow(settings, key, title, subtitle, lower, upper) {
        const row = new Adw.SpinRow({
            title,
            subtitle,
            adjustment: new Gtk.Adjustment({
                lower, upper, step_increment: 5, page_increment: 10,
            }),
        });
        const load = () => {
            const percent = Math.round(settings.get_double(key) * 100);
            if (row.value !== percent)
                row.value = percent;
        };
        load();
        row.connect('notify::value', () => {
            const value = row.value / 100;
            if (Math.abs(value - settings.get_double(key)) > 0.001)
                settings.set_double(key, value);
        });
        this._handlerIds.push(settings.connect(`changed::${key}`, load));
        return row;
    }

    _backgroundGroup(settings) {
        const group = new Adw.PreferencesGroup({title: 'Background'});
        group.add(this._percentRow(settings, 'pill-opacity', 'Opacity', 'Percent.', 0, 100));

        const borderRow = this._spinRow(settings, 'border-width', 'Border width',
            'Pixels. 0 draws no border.', 0, 6, 1);
        group.add(borderRow);
        const borderButton = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog({with_alpha: true}),
            valign: Gtk.Align.CENTER,
        });
        const loadBorder = () => {
            const rgba = new Gdk.RGBA();
            if (rgba.parse(settings.get_string('border-color')) && !rgba.equal(borderButton.rgba))
                borderButton.rgba = rgba;
        };
        loadBorder();
        borderButton.connect('notify::rgba', () => {
            const str = borderButton.rgba.to_string();
            if (str !== settings.get_string('border-color'))
                settings.set_string('border-color', str);
        });
        this._handlerIds.push(settings.connect('changed::border-color', loadBorder));
        const borderColorRow = new Adw.ActionRow({
            title: 'Border colour',
            activatable_widget: borderButton,
        });
        borderColorRow.add_suffix(borderButton);
        const updateBorderSensitive = () => {
            borderColorRow.sensitive = settings.get_int('border-width') > 0;
        };
        updateBorderSensitive();
        this._handlerIds.push(settings.connect('changed::border-width', updateBorderSensitive));
        group.add(borderColorRow);

        const shadowRow = new Adw.SwitchRow({title: 'Drop shadow'});
        settings.bind('shadow', shadowRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(shadowRow);

        const blurRow = new Adw.SwitchRow({
            title: 'Blur background',
            subtitle: 'Works best with a low opacity.',
        });
        settings.bind('blur', blurRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(blurRow);
        const blurStrengthRow = this._spinRow(settings, 'blur-radius', 'Blur strength',
            'Pixels.', 1, 100, 1);
        settings.bind('blur', blurStrengthRow, 'sensitive', Gio.SettingsBindFlags.GET);
        group.add(blurStrengthRow);
        return group;
    }

    _dotsGroup(settings) {
        const group = new Adw.PreferencesGroup({title: 'Dots'});
        const dotsRow = new Adw.SwitchRow({title: 'Show position dots'});
        settings.bind('show-dots', dotsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(dotsRow);
        const sizeRow = this._spinRow(settings, 'dot-size', 'Dot size',
            'Pixels. The current dot is wider.', 4, 12, 1);
        settings.bind('show-dots', sizeRow, 'sensitive', Gio.SettingsBindFlags.GET);
        group.add(sizeRow);
        const onlyCurrentRow = new Adw.SwitchRow({title: 'Show only the current dot'});
        settings.bind('hide-inactive-dots', onlyCurrentRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        settings.bind('show-dots', onlyCurrentRow, 'sensitive', Gio.SettingsBindFlags.GET);
        group.add(onlyCurrentRow);
        return group;
    }

    _coloursGroup(settings) {
        // with_alpha is a property of the dialog, so one dialog per kind.
        const opaqueDialog = new Gtk.ColorDialog({with_alpha: false});
        const alphaDialog = new Gtk.ColorDialog({with_alpha: true});
        const expander = new Adw.ExpanderRow({
            title: 'Custom colours',
            show_enable_switch: true,
        });
        settings.bind('use-custom-colors', expander, 'enable-expansion',
            Gio.SettingsBindFlags.DEFAULT);
        // Turning the switch on opens the section; the binding also fires
        // this at window open when the setting is already on.
        const expandWhenEnabled = () => {
            if (expander.enable_expansion)
                expander.expanded = true;
        };
        expander.connect('notify::enable-expansion', expandWhenEnabled);
        expandWhenEnabled();

        const colorRow = (key, title, withAlpha) => {
            const button = new Gtk.ColorDialogButton({
                dialog: withAlpha ? alphaDialog : opaqueDialog,
                valign: Gtk.Align.CENTER,
            });
            const load = () => {
                const rgba = new Gdk.RGBA();
                if (rgba.parse(settings.get_string(key)) && !rgba.equal(button.rgba))
                    button.rgba = rgba;
            };
            load();
            button.connect('notify::rgba', () => {
                const str = button.rgba.to_string();
                if (str !== settings.get_string(key))
                    settings.set_string(key, str);
            });
            this._handlerIds.push(settings.connect(`changed::${key}`, load));
            const row = new Adw.ActionRow({title, activatable_widget: button});
            row.add_suffix(button);
            expander.add_row(row);
        };
        colorRow('pill-color', 'Background', false);
        colorRow('name-color', 'Current name', false);
        colorRow('neighbour-color', 'Neighbour names', true);
        colorRow('dot-color', 'Dots', true);

        const resetRow = new Adw.ButtonRow({title: 'Reset colours'});
        resetRow.connect('activated', () => {
            ['pill-color', 'name-color', 'neighbour-color', 'dot-color']
                .forEach(key => settings.reset(key));
        });
        expander.add_row(resetRow);

        const group = new Adw.PreferencesGroup({
            title: 'Colours',
            description: 'Off uses the default colours.',
        });
        group.add(expander);
        return group;
    }
}
