import Gio from 'gi://Gio';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {workspaceLabels} from './labels.js';
import {Ticker} from './ticker.js';

export default class WorkspaceTickerExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        // Names live in GNOME's own setting (Space Bar writes there too), so
        // this works with or without Space Bar.
        this._wmSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.preferences'});
        this._mutterSettings = new Gio.Settings({schema_id: 'org.gnome.mutter'});
        this._ticker = new Ticker(this._settings);
        this._activeIndex = global.workspace_manager.get_active_workspace_index();

        global.workspace_manager.connectObject(
            'active-workspace-changed', () => this._onSwitch(),
            'notify::n-workspaces', () => this._refresh(),
            this);
        this._wmSettings.connectObject('changed::workspace-names', () => this._refresh(), this);
        this._mutterSettings.connectObject('changed::dynamic-workspaces', () => this._refresh(), this);
        this._settings.connectObject('changed', () => this._refresh(), this);
    }

    disable() {
        global.workspace_manager.disconnectObject(this);
        this._wmSettings.disconnectObject(this);
        this._mutterSettings.disconnectObject(this);
        this._settings.disconnectObject(this);

        this._ticker.destroy();
        this._ticker = null;
        this._wmSettings = null;
        this._mutterSettings = null;
        this._settings = null;
    }

    _labels() {
        const manager = global.workspace_manager;
        return workspaceLabels(
            this._wmSettings.get_strv('workspace-names'),
            manager.n_workspaces,
            manager.get_active_workspace_index(),
            this._mutterSettings.get_boolean('dynamic-workspaces'),
            this._settings.get_string('unnamed-format'),
            this._settings.get_boolean('show-number'));
    }

    // With workspaces on the primary monitor only, that is where the switch
    // happens; otherwise follow the monitor the user is on.
    _monitor() {
        return Meta.prefs_get_workspaces_only_on_primary()
            ? Main.layoutManager.primaryMonitor
            : Main.layoutManager.currentMonitor;
    }

    _onSwitch() {
        const from = this._activeIndex;
        const to = global.workspace_manager.get_active_workspace_index();
        this._activeIndex = to;

        // The overview has its own workspace UI; a fullscreen window should
        // not be covered.
        const monitor = this._monitor();
        if (Main.overview.visible || !monitor || monitor.inFullscreen)
            return;

        const labels = this._labels();
        this._ticker.show(monitor, labels, Math.min(from, labels.length - 1), to);
    }

    // Workspaces added, removed or renamed, or a setting changed: rebuild in
    // place if the pill is up; otherwise the next show builds fresh anyway.
    _refresh() {
        this._activeIndex = global.workspace_manager.get_active_workspace_index();
        const monitor = this._monitor();
        if (this._ticker.visible && monitor)
            this._ticker.refresh(monitor, this._labels(), this._activeIndex);
    }
}
