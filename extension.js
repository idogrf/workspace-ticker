import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class WorkspaceTickerExtension extends Extension {
    enable() {
        console.log('workspace-ticker: enabled');
    }

    disable() {
        console.log('workspace-ticker: disabled');
    }
}
