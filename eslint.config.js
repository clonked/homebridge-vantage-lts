import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['dist/**'],
    },
    {
        rules: {
           /* 'quotes': ['warning', 'single'],
            'indent': ['warning', 4, { 'SwitchCase': 0 }],
            'linebreak-style': ['warning', 'unix'],
            'semi': ['warning', 'always'],
            'comma-dangle': ['warning', 'always-multiline'],
            'dot-notation': 'warning',
            'eqeqeq': ['warning', 'smart'],
            'curly': ['warning', 'all'],
            'brace-style': ['warning'],
            'prefer-arrow-callback': 'warning',
            'max-len': ['warning', 160],
            'object-curly-spacing': ['warning', 'always'],
            'no-use-before-define': 'off',
            '@typescript-eslint/no-use-before-define': ['warning', { 'classes': false, 'enums': false }],
            '@typescript-eslint/no-unused-vars': ['warning', { 'caughtErrors': 'none' }], */
        },
    },
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
        },
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
);