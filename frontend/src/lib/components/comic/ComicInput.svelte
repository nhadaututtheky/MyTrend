<script lang="ts">
  type InputType = 'text' | 'email' | 'password' | 'search' | 'url' | 'number';

  interface Props {
    value?: string;
    type?: InputType;
    placeholder?: string;
    label?: string;
    error?: string;
    disabled?: boolean;
    required?: boolean;
    name?: string;
    icon?: string;
    oninput?: (e: Event) => void;
    onchange?: (e: Event) => void;
  }

  let {
    value = $bindable(''),
    type = 'text',
    placeholder = '',
    label,
    error,
    disabled = false,
    required = false,
    name,
    icon,
    oninput,
    onchange,
  }: Props = $props();

  const inputId = $derived(name ?? `input-${Math.random().toString(36).slice(2, 8)}`);
</script>

<div class="input-group" data-testid="comic-input">
  {#if label}
    <label for={inputId} class="label">
      {label}
      {#if required}<span class="required" aria-hidden="true">*</span>{/if}
    </label>
  {/if}
  <div class="input-wrapper" class:has-icon={!!icon}>
    {#if icon}
      <span class="input-icon" aria-hidden="true">{icon}</span>
    {/if}
  <input
    id={inputId}
    class="input"
    class:has-error={error}
    {type}
    {placeholder}
    {disabled}
    {required}
    {name}
    bind:value
    {oninput}
    {onchange}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={error ? `${inputId}-error` : undefined}
  />
  </div>
  {#if error}
    <span id="{inputId}-error" class="error" role="alert">{error}</span>
  {/if}
</div>

<style>
  .input-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
  }

  .label {
    font-family: var(--font-comic);
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .required {
    color: var(--accent-red);
  }

  .input {
    font-family: var(--font-comic);
    font-size: 0.875rem;
    padding: var(--spacing-sm) var(--spacing-md);
    border: var(--border-width) solid var(--border-color);
    border-radius: var(--radius-sketch);
    background: var(--bg-card);
    color: var(--text-primary);
    width: 100%;
    transition: box-shadow 150ms ease;
  }

  .input:focus {
    outline: none;
    box-shadow: var(--shadow-md);
  }

  .input::placeholder {
    color: var(--text-muted);
  }

  .input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .has-error {
    border-color: var(--accent-red);
  }

  .error {
    font-size: 0.75rem;
    color: var(--accent-red);
    font-weight: 700;
  }

  .input-wrapper {
    position: relative;
    width: 100%;
  }

  .has-icon .input {
    padding-left: calc(var(--spacing-md) + 24px);
  }

  .input-icon {
    position: absolute;
    left: var(--spacing-md);
    top: 50%;
    transform: translateY(-50%);
    font-size: 1rem;
    color: var(--text-muted);
    pointer-events: none;
    line-height: 1;
  }
</style>
