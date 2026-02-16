import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import sveltePlugin from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...sveltePlugin.configs['flat/recommended'],
  prettier,
  {
    languageOptions: {
      globals: {
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        SVGSVGElement: 'readonly',
        Event: 'readonly',
        SubmitEvent: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        TextDecoder: 'readonly',
        ReadableStreamDefaultReader: 'readonly',
        RequestInit: 'readonly',
        URL: 'readonly',
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        AbortController: 'readonly',
        File: 'readonly',
        SVGElement: 'readonly',
        SVGGElement: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        HTMLCanvasElement: 'readonly',
        CanvasRenderingContext2D: 'readonly',
        getComputedStyle: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        crypto: 'readonly',
      },
      parserOptions: {
        extraFileExtensions: ['.svelte'],
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
        },
      ],
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      'no-nested-ternary': 'error',
      'max-depth': ['error', 3],
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      'prefer-const': 'off',
    },
  },
  {
    ignores: [
      '.svelte-kit/',
      'build/',
      'dist/',
      'node_modules/',
      'coverage/',
      '*.config.js',
      '*.config.ts',
    ],
  },
);
