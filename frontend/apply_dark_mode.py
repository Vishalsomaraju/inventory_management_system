import os
import re

directories = [
    'e:/inventory_management_system/frontend/src/pages',
    'e:/inventory_management_system/frontend/src/components'
]
exclude = ['DashboardPage.jsx', 'Navbar.jsx', 'Layout.jsx']

mappings = {
    r'\bbg-white\b(?! dark:)': 'bg-white dark:bg-slate-800',
    r'\bbg-slate-50\b(?! dark:)': 'bg-slate-50 dark:bg-slate-800/50',
    r'\bbg-rose-50\b(?! dark:)': 'bg-rose-50 dark:bg-rose-900/20',
    r'\bbg-emerald-50\b(?! dark:)': 'bg-emerald-50 dark:bg-emerald-900/20',
    r'\bbg-amber-50\b(?! dark:)': 'bg-amber-50 dark:bg-amber-900/20',
    r'\btext-slate-900\b(?! dark:)': 'text-slate-900 dark:text-white',
    r'\btext-slate-800\b(?! dark:)': 'text-slate-800 dark:text-slate-200',
    r'\btext-slate-700\b(?! dark:)': 'text-slate-700 dark:text-slate-300',
    r'\btext-slate-600\b(?! dark:)': 'text-slate-600 dark:text-slate-400',
    r'\btext-slate-500\b(?! dark:)': 'text-slate-500 dark:text-slate-400',
    r'\bborder-slate-200\b(?! dark:)': 'border-slate-200 dark:border-slate-700',
    r'\bdivide-slate-200\b(?! dark:)': 'divide-slate-200 dark:divide-slate-700',
    r'\bdivide-slate-100\b(?! dark:)': 'divide-slate-100 dark:divide-slate-700/50',
}

for d in directories:
    if not os.path.exists(d): continue
    for f in os.listdir(d):
        if f.endswith('.jsx') and f not in exclude:
            path = os.path.join(d, f)
            with open(path, 'r', encoding='utf-8') as file:
                content = file.read()
                
            original = content
            for pat, repl in mappings.items():
                content = re.sub(pat, repl, content)
                
            if content != original:
                with open(path, 'w', encoding='utf-8') as file:
                    file.write(content)
                print(f"Updated {f}")
