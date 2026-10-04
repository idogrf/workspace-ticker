import {workspaceLabels} from '../labels.js';
import {check, finish} from './assert.js';

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check('names and unnamed',
    eq(workspaceLabels(['Main', 'Private', 'Gantry'], 4, 0, false, '{number}'),
        ['Main', 'Private', 'Gantry', '4']));
check('blank name counts as unnamed',
    eq(workspaceLabels(['Main', '  ', ''], 3, 0, false, '{number}'), ['Main', '2', '3']));
check('format with text',
    eq(workspaceLabels([], 2, 0, false, 'Workspace {number}'), ['Workspace 1', 'Workspace 2']));
check('format repeated placeholder',
    eq(workspaceLabels([], 1, 0, false, '{number}/{number}'), ['1/1']));
check('empty format falls back to the number',
    eq(workspaceLabels([], 2, 0, false, ''), ['1', '2']));
check('blank format falls back to the number',
    eq(workspaceLabels([], 2, 0, false, '   '), ['1', '2']));
check('extra names ignored',
    eq(workspaceLabels(['A', 'B', 'C'], 2, 0, false, '{number}'), ['A', 'B']));
check('dynamic: spare last workspace hidden',
    eq(workspaceLabels(['Main', 'Private'], 3, 1, true, '{number}'), ['Main', 'Private']));
check('dynamic: spare shown when active',
    eq(workspaceLabels(['Main', 'Private'], 3, 2, true, '{number}'), ['Main', 'Private', '3']));
check('dynamic: single workspace stays',
    eq(workspaceLabels([], 1, 0, true, '{number}'), ['1']));

finish();
