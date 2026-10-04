// SPDX-License-Identifier: GPL-2.0-or-later
// Turns GNOME's workspace names into the texts the strip shows. Free of
// GNOME imports so the unit tests can run it with plain gjs.

/**
 * Builds one label per shown workspace, in workspace order.
 *
 * With dynamic workspaces GNOME always keeps one empty spare workspace at the
 * end; it is left out unless it is the one being switched to, so the strip
 * never ends in a stray number the user did not create.
 *
 * @param {string[]} names - The `workspace-names` setting; may be shorter or
 *   longer than `count`, and may contain blank entries.
 * @param {number} count - Number of workspaces.
 * @param {number} activeIndex - Index of the active workspace.
 * @param {boolean} dynamic - Whether `org.gnome.mutter dynamic-workspaces` is on.
 * @param {string} unnamedFormat - Label for unnamed workspaces; `{number}` is
 *   replaced with the 1-based index. Blank means just the number.
 * @param {boolean} [showNumber] - Prefix named workspaces with their 1-based
 *   number as "N · Name"; unnamed ones keep their format output.
 * @returns {string[]} Label texts.
 */
export function workspaceLabels(names, count, activeIndex, dynamic, unnamedFormat, showNumber = false) {
    const shown = dynamic && count > 1 && activeIndex !== count - 1 ? count - 1 : count;
    const format = unnamedFormat.trim() === '' ? '{number}' : unnamedFormat;

    const labels = [];
    for (let i = 0; i < shown; i++) {
        const name = (names[i] ?? '').trim();
        if (!name)
            labels.push(format.replaceAll('{number}', String(i + 1)));
        else
            labels.push(showNumber ? `${i + 1} \u00b7 ${name}` : name);
    }
    return labels;
}
