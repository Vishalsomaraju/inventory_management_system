const fs = require('fs');
const file = 'src/pages/AIAssistant.jsx';
let content = fs.readFileSync(file, 'utf8');

// Color swap
content = content.replace(/gray-/g, 'slate-');
content = content.replace(/blue-/g, 'sky-');

// Map light to dark
const mappings = {
    '\\bbg-white\\b(?! dark:)': 'bg-white dark:bg-slate-800',
    '\\bbg-slate-50\\b(?! dark:)': 'bg-slate-50 dark:bg-slate-900/50',
    '\\bbg-slate-100\\b(?! dark:)': 'bg-slate-100 dark:bg-slate-800/50',
    '\\bborder-slate-200\\b(?! dark:)': 'border-slate-200 dark:border-slate-700',
    '\\bborder-slate-100\\b(?! dark:)': 'border-slate-100 dark:border-slate-700',
    '\\btext-slate-900\\b(?! dark:)': 'text-slate-900 dark:text-white',
    '\\btext-slate-800\\b(?! dark:)': 'text-slate-800 dark:text-slate-200',
    '\\btext-slate-700\\b(?! dark:)': 'text-slate-700 dark:text-slate-300',
    '\\btext-slate-500\\b(?! dark:)': 'text-slate-500 dark:text-slate-400',
    '\\btext-slate-400\\b(?! dark:)': 'text-slate-400 dark:text-slate-500',
    '\\bhover:bg-slate-50\\b(?! dark:)': 'hover:bg-slate-50 dark:hover:bg-slate-700',
    '\\bhover:border-slate-200\\b(?! dark:)': 'hover:border-slate-200 dark:hover:border-slate-600',
    '\\bbg-red-50\\b(?! dark:)': 'bg-red-50 dark:bg-red-900/20',
    '\\bborder-red-200\\b(?! dark:)': 'border-red-200 dark:border-red-900/50',
    '\\bbg-amber-50\\b(?! dark:)': 'bg-amber-50 dark:bg-amber-900/20',
    '\\bborder-amber-200\\b(?! dark:)': 'border-amber-200 dark:border-amber-900/50',
    '\\bbg-sky-50\\b(?! dark:)': 'bg-sky-50 dark:bg-sky-900/20',
    '\\bborder-sky-200\\b(?! dark:)': 'border-sky-200 dark:border-sky-900/50',
};

for (const [pattern, replacement] of Object.entries(mappings)) {
    content = content.replace(new RegExp(pattern, 'g'), replacement);
}

fs.writeFileSync(file, content, 'utf8');
console.log('Processed ' + file);
