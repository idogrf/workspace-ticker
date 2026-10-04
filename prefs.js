import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class WorkspaceTickerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const spinRow = (key, title, subtitle, lower, upper, step) => {
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
        };

        const timing = new Adw.PreferencesGroup({
            title: 'Timing',
            description: 'Changes apply right away — no need to log out.',
        });
        timing.add(spinRow('display-duration', 'Display duration',
            'Milliseconds the strip stays up after sliding, before it fades.',
            300, 5000, 50));
        timing.add(spinRow('animation-duration', 'Slide duration',
            'Milliseconds the slide to the new workspace takes. 0 jumps.',
            0, 1000, 25));

        const appearance = new Adw.PreferencesGroup({title: 'Appearance'});
        appearance.add(spinRow('bottom-offset', 'Distance from bottom',
            'Percent of the screen height between the bottom edge and the strip.',
            0, 50, 1));
        appearance.add(spinRow('font-size', 'Font size',
            'Pixels, for the current name. Neighbours are drawn at 0.6 of it.',
            12, 72, 1));
        const widthRow = spinRow('strip-width-em', 'Strip width',
            'Multiples of the font size. 7.5 fits about three names.',
            4, 20, 0.5);
        widthRow.digits = 1;
        appearance.add(widthRow);
        const dotsRow = new Adw.SwitchRow({title: 'Show position dots'});
        settings.bind('show-dots', dotsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        appearance.add(dotsRow);

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
        page.add(appearance);
        page.add(naming);
        window.add(page);
        window.add(this._colorsPage(settings));
    }

    _colorsPage(settings) {
        // with_alpha is a property of the dialog, so one dialog per kind.
        const opaqueDialog = new Gtk.ColorDialog({with_alpha: false});
        const alphaDialog = new Gtk.ColorDialog({with_alpha: true});
        const expander = new Adw.ExpanderRow({
            title: 'Custom colours',
            show_enable_switch: true,
        });
        settings.bind('use-custom-colors', expander, 'enable-expansion',
            Gio.SettingsBindFlags.DEFAULT);

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
            settings.connect(`changed::${key}`, load);
            const row = new Adw.ActionRow({title, activatable_widget: button});
            row.add_suffix(button);
            expander.add_row(row);
        };
        colorRow('pill-color', 'Background', false);
        colorRow('name-color', 'Current name', false);
        colorRow('neighbour-color', 'Neighbour names', true);
        colorRow('dot-color', 'Dots', true);

        // Stored as 0-1, shown as percent.
        const opacityRow = new Adw.SpinRow({
            title: 'Background opacity',
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
        settings.connect('changed::pill-opacity', loadOpacity);
        expander.add_row(opacityRow);

        const resetRow = new Adw.ButtonRow({title: 'Reset colours'});
        resetRow.connect('activated', () => {
            ['pill-color', 'pill-opacity', 'name-color', 'neighbour-color', 'dot-color']
                .forEach(key => settings.reset(key));
        });
        expander.add_row(resetRow);

        const group = new Adw.PreferencesGroup({
            description: 'Off uses the theme\'s look. Changes apply right away.',
        });
        group.add(expander);
        const page = new Adw.PreferencesPage({
            title: 'Colours',
            icon_name: 'applications-graphics-symbolic',
        });
        page.add(group);
        return page;
    }
}
