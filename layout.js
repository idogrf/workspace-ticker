// SPDX-License-Identifier: GPL-2.0-or-later
// Layout maths for the ticker strip. Kept free of GNOME imports so the unit
// tests can run it with plain gjs.

// Scale of every label one step or more away from the current position.
export const NEIGHBOUR_SCALE = 0.6;
// Space between labels, relative to the font size so it grows with the text.
export const GAP_RATIO = 0.6;
// Labels fade out over this share of the pill width at each edge.
const EDGE_FADE_RATIO = 0.30;

/**
 * Places every label for strip position `position`, a fractional index:
 * 1.5 means half way between the second and third label.
 *
 * Each label's scale falls from 1 at the position to the neighbour scale one
 * step away, and its opacity from 1 to the neighbour opacity the same way. The scaled labels are packed left to right with a constant gap, and
 * the whole row is shifted so the point between the two labels around the
 * position sits at the pill's centre. Recomputing this every frame from one
 * number is what makes the slide and the grow move together.
 *
 * @param {number[]} widths - Natural (full-size) label widths in px.
 * @param {number} position - Fractional strip index; clamped to the labels.
 * @param {number} fontSize - Font size of the current label in px.
 * @param {number} pillWidth - Width of the pill in px.
 * @param {{neighbourScale?: number, neighbourOpacity?: number}} [options] -
 *   Scale one step away (default NEIGHBOUR_SCALE) and opacity one step away,
 *   0–1 (default 1, no dimming).
 * @returns {{center: number, scale: number, opacity: number}[]} Per label:
 *   visual centre in pill coordinates, scale, and opacity 0–255.
 */
export function computeLayout(widths, position, fontSize, pillWidth, options = {}) {
    const {neighbourScale = NEIGHBOUR_SCALE, neighbourOpacity = 1} = options;
    if (widths.length === 0)
        return [];

    const p = Math.min(Math.max(position, 0), widths.length - 1);
    const scales = widths.map((_, i) =>
        1 - (1 - neighbourScale) * Math.min(Math.abs(i - p), 1));

    const gap = GAP_RATIO * fontSize;
    const centers = [];
    let x = 0;
    widths.forEach((width, i) => {
        const scaled = width * scales[i];
        centers.push(x + scaled / 2);
        x += scaled + gap;
    });

    const lo = Math.floor(p);
    const hi = Math.ceil(p);
    const focus = centers[lo] + (p - lo) * (centers[hi] - centers[lo]);
    const shift = pillWidth / 2 - focus;

    const fadeWidth = EDGE_FADE_RATIO * pillWidth;
    return centers.map((raw, i) => {
        const center = raw + shift;
        const edgeDistance = Math.min(center, pillWidth - center);
        const visible = Math.min(Math.max(edgeDistance / fadeWidth, 0), 1);
        // Same k as the scale: 1 at the position, 0 a step or more away.
        const k = Math.max(0, 1 - Math.abs(i - p));
        const dim = neighbourOpacity + (1 - neighbourOpacity) * k;
        return {center, scale: scales[i], opacity: Math.round(255 * visible * dim)};
    });
}
