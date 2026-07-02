import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['dist/**'],
    },
    {
        rules: {
 /*           'quotes': ['warn', 'single'],
            'indent': ['warn', 4, { 'SwitchCase': 0 }],
            'linebreak-style': ['warn', 'unix'],
            'semi': ['warn', 'always'],
            'comma-dangle': ['warn', 'always-multiline'],
            'dot-notation': 'warn',
            'eqeqeq': ['warn', 'smart'],
            'curly': ['warn', 'all'],
            'brace-style': ['warn'],
            'prefer-arrow-callback': 'warn',
            'max-len': ['warn', 160],
            'object-curly-spacing': ['warn', 'always'],
            'no-use-before-define': 'off',
            '@typescript-eslint/no-use-before-define': ['warn', { 'classes': false, 'enums': false }],
            '@typescript-eslint/no-unused-vars': ['warn', { 'caughtErrors': 'none' }], */
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