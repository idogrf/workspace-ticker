import Adw from 'gi://Adw';
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
        appearance.add(spinRow('strip-width', 'Strip width',
            'Percent of the screen width. Names beyond it fade out.',
            20, 100, 1));

        const naming = new Adw.PreferencesGroup({
            title: 'Unnamed workspaces',
            description: '{number} is replaced with the workspace number. ' +
                'Leave blank to show just the number.',
        });
        const formatRow = new Adw.EntryRow({title: 'Label format'});
        settings.bind('unnamed-format', formatRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        naming.add(formatRow);

        const page = new Adw.PreferencesPage();
        page.add(timing);
        page.add(appearance);
        page.add(naming);
        window.add(page);
    }
}
