export const version: string = __VERSION__;

export type AnswerValue = string | number | boolean | null | AnswerValue[] | Answers;
export interface Answers {
  [key: string]: AnswerValue;
}

export interface ReadyMessage {
  type: 'ready';
}

export interface InitMessage {
  type: 'init';
  answers?: Answers;
}

export type FormMessage = { type: 'height'; height: number } | { type: 'redirect'; url: string };

export interface EmbedOptions {
  answers?: Answers;
  height?: 'auto' | number;
  onRedirect?: (url: string) => boolean | void;
  onError?: (error: Error) => void;
}

export interface EmbedHandle {
  destroy(): void;
}

const READY_TIMEOUT_MS = 10_000;

export function embed(
  target: string | Element,
  formUrl: string,
  {
    answers,
    height = 'auto',
    onRedirect,
    onError = window.reportError.bind(window),
  }: EmbedOptions = {},
): EmbedHandle {
  const container = typeof target === 'string' ? document.querySelector(target) : target;
  if (!container) {
    throw new Error('Rooks embed target was not found.');
  }

  const url = new URL(formUrl);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Rooks form URL must use HTTP or HTTPS.');
  }
  url.searchParams.set('embed', answers === undefined ? '1' : 'answers');

  let port: MessagePort | undefined;
  function onFormMessage(event: MessageEvent<FormMessage>) {
    const message = event.data;
    if (message?.type === 'height' && height === 'auto') {
      if (Number.isFinite(message.height) && message.height >= 0) {
        iframe.style.height = `${message.height}px`;
      }
    } else if (message?.type === 'redirect' && typeof message.url === 'string') {
      let destination: URL;
      try {
        destination = new URL(message.url, url);
      } catch {
        return;
      }
      if (destination.protocol !== 'https:' && destination.protocol !== 'http:') {
        return;
      }
      if (onRedirect?.(destination.href) !== false) {
        window.location.assign(destination.href);
      }
    }
  }

  function onReady(event: MessageEvent<ReadyMessage>) {
    const formWindow = iframe.contentWindow;
    if (
      !formWindow ||
      event.source !== formWindow ||
      event.origin !== url.origin ||
      event.data?.type !== 'ready'
    ) {
      return;
    }

    window.clearTimeout(timeout);
    port?.close();
    const channel = new MessageChannel();
    port = channel.port1;
    port.addEventListener('message', onFormMessage);
    port.start();

    const init: InitMessage = answers === undefined ? { type: 'init' } : { type: 'init', answers };
    formWindow.postMessage(init, url.origin, [channel.port2]);
  }

  window.addEventListener('message', onReady);
  const iframe = document.createElement('iframe');
  iframe.title = 'Rooks form';
  iframe.style.cssText = `display: block; width: 100%; border: 0; height: ${height === 'auto' ? 150 : height}px`;
  iframe.src = url.href;
  const timeout = window.setTimeout(() => {
    onError(
      new Error(
        `Rooks form did not respond. Add ${window.location.origin} to the form’s allowed domains.`,
      ),
    );
  }, READY_TIMEOUT_MS);
  container.append(iframe);

  return {
    destroy() {
      window.removeEventListener('message', onReady);
      window.clearTimeout(timeout);
      port?.close();
      iframe.remove();
    },
  };
}
