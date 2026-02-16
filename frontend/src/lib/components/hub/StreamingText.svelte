<script lang="ts">
  interface Props {
    text: string;
    isStreaming?: boolean;
  }

  let { text, isStreaming = false }: Props = $props();
</script>

<div class="streaming-text" data-testid="streaming-text">
  <span class="text-content">{@html text.replace(/\n/g, '<br>')}</span>
  {#if isStreaming}
    <span class="cursor" aria-hidden="true">|</span>
  {/if}
</div>

<style>
  .streaming-text {
    font-size: 0.875rem;
    line-height: 1.6;
    word-break: break-word;
  }

  .cursor {
    display: inline-block;
    color: var(--accent-green);
    font-weight: 700;
    animation: blink 0.8s step-end infinite;
  }

  @keyframes blink {
    50% { opacity: 0; }
  }
</style>
