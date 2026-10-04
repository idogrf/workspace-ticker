import {computeLayout, NEIGHBOUR_SCALE} from '../layout.js';
import {check, near, finish} from './assert.js';

// Three 100px labels, font 20 (gap 12), pill 600: on workspace 2 the
// neighbours are 0.6 → scaled widths 60,100,60 → raw centres 30,122,214,
// shifted so 122 lands on 300.
{
    const items = computeLayout([100, 100, 100], 1, 20, 600);
    check('integer: current is full size', items[1].scale === 1);
    check('integer: neighbours shrink', items[0].scale === NEIGHBOUR_SCALE && items[2].scale === NEIGHBOUR_SCALE);
    check('integer: current is centred', near(items[1].center, 300));
    check('integer: left neighbour', near(items[0].center, 208));
    check('integer: right neighbour', near(items[2].center, 392));
    check('integer: current fully opaque', items[1].opacity === 255);
}

// Half way between 2 and 3: both at 0.8, symmetric around the centre.
{
    const items = computeLayout([100, 100, 100], 1.5, 20, 600);
    check('half: both at 0.8', near(items[1].scale, 0.8) && near(items[2].scale, 0.8));
    check('half: symmetric around centre',
        near(300 - items[1].center, items[2].center - 300));
    check('half: focus between them', items[1].center < 300 && items[2].center > 300);
}

// First workspace: centred, nothing to its left.
{
    const items = computeLayout([100, 100, 100], 0, 20, 600);
    check('first: centred', near(items[0].center, 300));
    check('first: others to the right', items.slice(1).every(i => i.center > 300));
}

// Edge fade: pill 300 → fade over 90px each side. Centres 150, 242, 314…
// The second label is 58px from the right edge → round(255 * 58 / 90) = 164.
{
    const items = computeLayout([100, 100, 100, 100], 0, 20, 300);
    check('fade: centre opaque', items[0].opacity === 255);
    check('fade: inside fade zone is partial', items[1].opacity === 164);
    check('fade: past the edge invisible', items[2].opacity === 0 && items[3].opacity === 0);
}

// Pill 600 → fade 180. Centres 300, 392: 208px from the edge, outside the zone.
{
    const items = computeLayout([100, 100, 100], 0, 20, 600);
    check('fade: outside fade zone stays opaque', items[1].opacity === 255);
}

// Partially inside the fade zone: pill 600, fade 180. Current 100px label
// raw centre 50, shift 250. Next label 600px at 0.6 → raw centre
// 100 + 12 + 180 = 292 → 542, i.e. 58 from the right edge →
// opacity round(255 * 58 / 180) = 82.
{
    const items = computeLayout([100, 600], 0, 20, 600);
    check('fade: part way through fade zone', items[1].opacity === 82);
}

// Position beyond the end (list shrank under us) clamps to the last label.
{
    const clamped = computeLayout([100, 100, 100], 5, 20, 600);
    const last = computeLayout([100, 100, 100], 2, 20, 600);
    check('clamp: same as last', clamped.every((it, i) => near(it.center, last[i].center)));
    const negative = computeLayout([100, 100, 100], -1, 20, 600);
    check('clamp: negative is first', near(negative[0].center, 300));
}

// No jump when an animation lands: p just below 1 ≈ p = 1.
{
    const before = computeLayout([80, 120, 90], 0.9999, 24, 500);
    const at = computeLayout([80, 120, 90], 1, 24, 500);
    check('continuity', before.every((it, i) => Math.abs(it.center - at[i].center) < 0.1));
}

check('empty strip', computeLayout([], 0, 20, 600).length === 0);

finish();
