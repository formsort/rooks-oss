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
  payload?: { answers: Answers };
}

export interface EmbedEventPayload {
  responseId: string;
  answers: Answers;
}

export interface PageEventPayload extends EmbedEventPayload {
  page: { id?: string; index: number };
}

export interface EmbedEventMap {
  loaded: EmbedEventPayload;
  pageLoaded: PageEventPayload;
  pageCompleted: PageEventPayload;
  responsesSaved: EmbedEventPayload;
  completed: EmbedEventPayload;
}

export type EmbedEventName = keyof EmbedEventMap;

export type FormMessage =
  | { type: 'height'; payload: { height: number } }
  | { type: 'redirect'; payload: { url: string } }
  | { [K in EmbedEventName]: { type: K; payload: EmbedEventMap[K] } }[EmbedEventName];

export interface EmbedOptions {
  answers?: Answers;
  height?: 'auto' | number;
  onRedirect?: (url: string) => boolean | void;
  onError?: (error: Error) => void;
}

export interface EmbedHandle {
  on<K extends EmbedEventName>(name: K, listener: (payload: EmbedEventMap[K]) => void): () => void;
  destroy(): void;
}

export interface RooksEmbedEventMap extends Omit<HTMLElementEventMap, 'error'> {
  loaded: CustomEvent<EmbedEventPayload>;
  pageLoaded: CustomEvent<PageEventPayload>;
  pageCompleted: CustomEvent<PageEventPayload>;
  responsesSaved: CustomEvent<EmbedEventPayload>;
  completed: CustomEvent<EmbedEventPayload>;
  redirect: CustomEvent<{ url: string }>;
  error: CustomEvent<Error>;
}

export interface RooksEmbedElement extends HTMLElement {
  answers: Answers | undefined;
  addEventListener<K extends keyof RooksEmbedEventMap>(
    type: K,
    listener: (this: RooksEmbedElement, event: RooksEmbedEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof RooksEmbedEventMap>(
    type: K,
    listener: (this: RooksEmbedElement, event: RooksEmbedEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'rooks-embed': RooksEmbedElement;
  }
}

const READY_TIMEOUT_MS = 10_000;
const eventNames = [
  'loaded',
  'pageLoaded',
  'pageCompleted',
  'responsesSaved',
  'completed',
] as const satisfies readonly EmbedEventName[];

type Listener = (payload: EmbedEventPayload) => void;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isEventPayload(type: string, payload: unknown): payload is EmbedEventPayload {
  if (!isObject(payload) || typeof payload.responseId !== 'string' || !isObject(payload.answers)) {
    return false;
  }
  if (type === 'pageLoaded' || type === 'pageCompleted') {
    return isObject(payload.page) && typeof payload.page.index === 'number';
  }
  return true;
}

// Sorts object keys, so equal answers in a different key order compare equal.
function answersKey(answers: Answers | undefined): string | undefined {
  return JSON.stringify(answers, (_, value: unknown) =>
    isObject(value) && !Array.isArray(value)
      ? // oxlint-disable-next-line unicorn/no-array-sort -- sorts a new array; toSorted() needs ES2023
        Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)))
      : value,
  );
}

export function embed(
  target: string | Element,
  formUrl: string,
  options: EmbedOptions = {},
): EmbedHandle {
  const container = typeof target === 'string' ? document.querySelector(target) : target;
  if (!container) {
    throw new Error('Rooks embed target was not found.');
  }
  return mount(container, formUrl, options);
}

function mount(
  container: Element | ShadowRoot,
  formUrl: string,
  { answers, height = 'auto', onRedirect, onError }: EmbedOptions,
): EmbedHandle {
  const url = new URL(formUrl);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Rooks form URL must use HTTP or HTTPS.');
  }
  url.searchParams.set('embed', answers === undefined ? '1' : 'answers');

  const listeners = new Map<string, Set<Listener>>();
  let destroyed = false;
  let port: MessagePort | undefined;
  function onFormMessage(event: MessageEvent<FormMessage>) {
    const message = event.data;
    if (message?.type === 'height' && height === 'auto') {
      iframe.style.height = `${message.payload?.height}px`;
    } else if (message?.type === 'redirect' && typeof message.payload?.url === 'string') {
      let destination: URL;
      try {
        destination = new URL(message.payload.url, url);
      } catch {
        return;
      }
      if (destination.protocol !== 'https:' && destination.protocol !== 'http:') {
        return;
      }
      if (onRedirect?.(destination.href) !== false) {
        window.location.assign(destination.href);
      }
    } else if (
      (eventNames as readonly string[]).includes(message?.type) &&
      isEventPayload(message.type, message.payload)
    ) {
      const set = listeners.get(message.type) ?? new Set();
      // A copy, so a listener added during dispatch waits for the next event.
      for (const listener of Array.from(set)) {
        if (destroyed) {
          return;
        }
        if (!set.has(listener)) {
          continue;
        }
        try {
          listener(message.payload);
        } catch (error) {
          reportError(error);
        }
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

    const init: InitMessage =
      answers === undefined ? { type: 'init' } : { type: 'init', payload: { answers } };
    formWindow.postMessage(init, url.origin, [channel.port2]);
  }

  window.addEventListener('message', onReady);
  const iframe = document.createElement('iframe');
  iframe.title = 'Rooks form';
  iframe.style.cssText = `display: block; width: 100%; border: 0; height: ${height === 'auto' ? 150 : height}px`;
  iframe.src = url.href;
  const timeout = window.setTimeout(() => {
    const error = new Error(
      `Rooks form did not respond. Check the published form URL and make sure ${window.location.origin} is in the form’s allowed domains.`,
    );
    if (onError) {
      onError(error);
    } else {
      throw error;
    }
  }, READY_TIMEOUT_MS);
  container.append(iframe);

  return {
    on(name, listener) {
      if (destroyed) {
        return () => {};
      }
      const set = listeners.get(name) ?? new Set();
      listeners.set(name, set);
      set.add(listener as Listener);
      return () => {
        set.delete(listener as Listener);
      };
    },
    destroy() {
      destroyed = true;
      listeners.clear();
      window.removeEventListener('message', onReady);
      window.clearTimeout(timeout);
      port?.close();
      iframe.remove();
    },
  };
}

// Creates the class only in browsers, so importing the package in Node works.
function defineElement(): void {
  if (typeof customElements === 'undefined' || customElements.get('rooks-embed')) {
    return;
  }
  // A constructed sheet works under Trusted Types and a strict style-src CSP.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(':host { display: block }');
  customElements.define(
    'rooks-embed',
    class extends HTMLElement {
      static observedAttributes = ['src', 'height'];
      #root = this.attachShadow({ mode: 'open' });
      #answers: Answers | undefined;
      #answersJson: string | undefined;
      #connected = false;
      #handle: EmbedHandle | undefined;

      constructor() {
        super();
        this.#root.adoptedStyleSheets = [sheet];
        // Moves answers set before the element upgraded onto the setter.
        if (Object.hasOwn(this, 'answers')) {
          const answers = (this as { answers?: Answers }).answers;
          Reflect.deleteProperty(this, 'answers');
          this.answers = answers;
        }
      }

      get answers(): Answers | undefined {
        return this.#answers;
      }

      set answers(value: Answers | undefined) {
        const json = answersKey(value);
        const changed = json !== this.#answersJson;
        this.#answers = value;
        this.#answersJson = json;
        if (changed && this.#connected) {
          this.#render();
        }
      }

      connectedCallback() {
        this.#connected = true;
        this.#render();
      }

      disconnectedCallback() {
        this.#connected = false;
        this.#handle?.destroy();
        this.#handle = undefined;
      }

      attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null) {
        if (oldValue !== newValue && this.#connected) {
          this.#render();
        }
      }

      #render() {
        this.#handle?.destroy();
        this.#handle = undefined;
        const src = this.getAttribute('src');
        if (!src) {
          return;
        }
        const pixels = Number(this.getAttribute('height'));
        try {
          this.#handle = mount(this.#root, src, {
            ...(this.#answers !== undefined && { answers: this.#answers }),
            height: Number.isFinite(pixels) && pixels > 0 ? pixels : 'auto',
            onRedirect: (url) =>
              this.dispatchEvent(
                new CustomEvent('redirect', { detail: { url }, cancelable: true }),
              ),
            onError: (error) => this.#fail(error),
          });
        } catch (error) {
          this.#fail(error);
          return;
        }
        for (const name of eventNames) {
          this.#handle.on(name, (detail) => this.dispatchEvent(new CustomEvent(name, { detail })));
        }
      }

      #fail(error: unknown) {
        if (this.dispatchEvent(new CustomEvent('error', { detail: error, cancelable: true }))) {
          reportError(error);
        }
      }
    },
  );
}

defineElement();
