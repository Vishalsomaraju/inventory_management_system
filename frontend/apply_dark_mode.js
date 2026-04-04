const fs = require('fs');
const path = require('path');

const directories = [
    'src/pages',
    'src/components'
];
const exclude = ['DashboardPage.jsx', 'Navbar.jsx', 'Layout.jsx'];

const mappings = {
    '\\bbg-white\\b(?! dark:)': 'bg-white dark:bg-slate-800',
    '\\bbg-slate-50\\b(?! dark:)': 'bg-slate-50 dark:bg-slate-800/50',
    '\\bbg-rose-50\\b(?! dark:)': 'bg-rose-50 dark:bg-rose-900/20',
    '\\bbg-emerald-50\\b(?! dark:)': 'bg-emerald-50 dark:bg-emerald-900/20',
    '\\bbg-amber-50\\b(?! dark:)': 'bg-amber-50 dark:bg-amber-900/20',
    '\\btext-slate-900\\b(?! dark:)': 'text-slate-900 dark:text-white',
    '\\btext-slate-800\\b(?! dark:)': 'text-slate-800 dark:text-slate-200',
    '\\btext-slate-700\\b(?! dark:)': 'text-slate-700 dark:text-slate-300',
    '\\btext-slate-600\\b(?! dark:)': 'text-slate-600 dark:text-slate-400',
    '\\btext-slate-500\\b(?! dark:)': 'text-slate-500 dark:text-slate-400',
    '\\bborder-slate-200\\b(?! dark:)': 'border-slate-200 dark:border-slate-700',
    '\\bborder-rose-200\\b(?! dark:)': 'border-rose-200 dark:border-rose-900/50',
    '\\btext-rose-700\\b(?! dark:)': 'text-rose-700 dark:text-rose-400',
    '\\bdivide-slate-200\\b(?! dark:)': 'divide-slate-200 dark:divide-slate-700',
    '\\bdivide-slate-100\\b(?! dark:)': 'divide-slate-100 dark:divide-slate-700/50',
};

directories.forEach(dir => {
    const fullDir = path.join(__dirname, dir);
    if (!fs.existsSync(fullDir)) return;
    
    fs.readdirSync(fullDir).forEach(file => {
        if (file.endsWith('.jsx') && !exclude.includes(file)) {
            const filePath = path.join(fullDir, file);
            let content = fs.readFileSync(filePath, 'utf8');
            let original = content;
            
            for (const [pattern, replacement] of Object.entries(mappings)) {
                content = content.replace(new RegExp(pattern, 'g'), replacement);
            }
            
            if (content !== original) {
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`Updated ${file}`);
            }
        }
    });
});
