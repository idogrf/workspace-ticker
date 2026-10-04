import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

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
            this._handlerIds.forEach(id => settings.disconnect(id));
            this._handlerIds = [];
            return false;
        });
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
        page.add(this._backgroundGroup(settings));
        page.add(this._dotsGroup(settings));
        page.add(this._coloursGroup(settings));
        return page;
    }

    _sizeGroup(settings) {
        const group = new Adw.PreferencesGroup({title: 'Size'});
        group.add(this._spinRow(settings, 'font-size', 'Font size',
            'Pixels, for the current name. Neighbours are drawn at 0.6 of it.',
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

    _backgroundGroup(settings) {
        const group = new Adw.PreferencesGroup({title: 'Background'});
        // Stored as 0-1, shown as percent.
        const opacityRow = new Adw.SpinRow({
            title: 'Opacity',
            subtitle: 'Percent.',
            adjustment: new Gtk.Adjustment({
                lower: 0, upper: 100, step_increment: 5, page_increment: 10,
            }),
        });
        const loadOpacity = () => {
            const percent = Math.round(settings.get_double('pill-opacity') * 100);
            if (opacityRow.value !== percent)
                opacityRow.value = percent;
        };
        loadOpacity();
        opacityRow.connect('notify::value', () => {
            const opacity = opacityRow.value / 100;
            if (Math.abs(opacity - settings.get_double('pill-opacity')) > 0.001)
                settings.set_double('pill-opacity', opacity);
        });
        this._handlerIds.push(settings.connect('changed::pill-opacity', loadOpacity));
        group.add(opacityRow);
        return group;
    }

    _dotsGroup(settings) {
        const group = new Adw.PreferencesGroup({title: 'Dots'});
        const dotsRow = new Adw.SwitchRow({title: 'Show position dots'});
        settings.bind('show-dots', dotsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(dotsRow);
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
