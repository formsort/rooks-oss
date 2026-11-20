import { afterEach, expect, test, vi } from 'vitest';
import { embed } from '../src/index.js';
import type { Answers, EmbedHandle, RooksEmbedElement } from '../src/index.js';

const formUrl = new URL('/test/form.html', location.href);
formUrl.hostname = location.hostname === 'localhost' ? '127.0.0.1' : 'localhost';

function nextFixtureMessage(type: string, origin: string): Promise<void> {
  return new Promise((resolve) => {
    function onMessage(event: MessageEvent) {
      if (event.origin === origin && event.data?.type === type) {
        window.removeEventListener('message', onMessage);
        resolve();
      }
    }
    window.addEventListener('message', onMessage);
  });
}

function mount(): HTMLDivElement {
  const target = document.createElement('div');
  target.className = 'embed-test';
  return document.body.appendChild(target);
}

const handles: EmbedHandle[] = [];

function embedEvents(target: Element): EmbedHandle {
  const handle = embed(target, `${formUrl}?height=420&events`);
  handles.push(handle);
  return handle;
}

const answers = { count: 3, enabled: true, choices: ['test'] };
const loaded = { responseId: 'response-1', answers: { first_name: 'Ada' } };
const page = {
  responseId: 'response-1',
  answers: { first_name: 'Ada' },
  page: { id: 'page-1', index: 0 },
};

function createElement(src: string, initialAnswers?: Answers): RooksEmbedElement {
  const element = document.createElement('rooks-embed');
  element.className = 'embed-test';
  element.answers = initialAnswers;
  element.setAttribute('src', src);
  // The fixture redirects forms that get answers; stay on the test page.
  element.addEventListener('redirect', (event) => event.preventDefault());
  return element;
}

function frameOf(element: RooksEmbedElement): HTMLIFrameElement | null {
  return element.shadowRoot!.querySelector('iframe');
}

afterEach(() => {
  handles.splice(0).forEach((handle) => handle.destroy());
  document.querySelectorAll('.embed-test').forEach((target) => target.remove());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('cross-origin forms get their own ports, including after a reload', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const first = mount();
  first.id = 'intake';
  const second = mount();
  const onRedirect = vi.fn<(url: string) => boolean>(() => false);
  const onError = vi.fn<(error: Error) => void>();
  const intake = embed('#intake', `${formUrl}?height=420`, {
    answers,
    onRedirect,
    onError,
  });
  const other = embed(second, `${formUrl}?height=700`, { onError });

  try {
    const intakeFrame = first.querySelector('iframe')!;
    const otherFrame = second.querySelector('iframe')!;
    expect(formUrl.origin).not.toBe(location.origin);
    expect(new URL(intakeFrame.src).search).toBe('?height=420&embed=answers');
    await expect.poll(() => intakeFrame.style.height).toBe('420px');
    await expect.poll(() => onRedirect).toHaveBeenCalledExactlyOnceWith(`${formUrl}#complete`);
    await expect.poll(() => otherFrame.style.height).toBe('700px');
    await vi.runAllTimersAsync();
    expect(onError).not.toHaveBeenCalled();

    intakeFrame.src = `${formUrl}?height=480&embed=answers`;
    await expect.poll(() => intakeFrame.style.height).toBe('480px');
    expect(otherFrame.style.height).toBe('700px');
  } finally {
    intake.destroy();
    other.destroy();
  }
  expect(first.querySelector('iframe')).toBeNull();
  expect(second.querySelector('iframe')).toBeNull();
});

test('ready from a different window or origin cannot prevent the timeout', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const target = mount();
  const onError = vi.fn<(error: Error) => void>();
  const handle = embed(target, `${formUrl}?silent`, { onError });

  try {
    const otherFrame = document.createElement('iframe');
    const otherLoaded = nextFixtureMessage('fixture-loaded', formUrl.origin);
    otherFrame.src = formUrl.href;
    target.append(otherFrame);
    await otherLoaded;

    const wrongOriginLoaded = nextFixtureMessage('fixture-loaded', location.origin);
    target.querySelector('iframe')!.src = new URL('/test/form.html', location.href).href;
    await wrongOriginLoaded;

    await vi.runAllTimersAsync();
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      new Error(
        `Rooks form did not respond. Check the published form URL and make sure ${location.origin} is in the form’s allowed domains.`,
      ),
    );

    const frame = target.querySelector('iframe')!;
    frame.src = `${formUrl}?height=420&embed=1`;
    await expect.poll(() => frame.style.height).toBe('420px');
  } finally {
    handle.destroy();
  }
});

test('rejects a non-HTTP(S) form URL before mounting an iframe', () => {
  const target = mount();
  expect(() => embed(target, 'javascript:void(0)')).toThrow(
    'Rooks form URL must use HTTP or HTTPS.',
  );
  expect(target.querySelector('iframe')).toBeNull();
});

test.each([
  ['loaded', loaded],
  ['pageLoaded', page],
  ['pageCompleted', page],
  ['responsesSaved', loaded],
  ['completed', loaded],
] as const)('on(%s) gets the event payload', async (name, expected) => {
  const listener = vi.fn<(payload: unknown) => void>();
  embedEvents(mount()).on(name, listener);

  await expect.poll(() => listener).toHaveBeenCalledExactlyOnceWith(expected);
});

test('off() removes only its own listener', async () => {
  const handle = embedEvents(mount());
  const removed = vi.fn<(payload: unknown) => void>();
  const kept = vi.fn<(payload: unknown) => void>();
  const off = handle.on('completed', removed);
  handle.on('completed', kept);
  off();

  await expect.poll(() => kept).toHaveBeenCalledOnce();
  expect(removed).not.toHaveBeenCalled();
});

test('listeners survive a reload, and a late listener gets only later events', async () => {
  const target = mount();
  const handle = embedEvents(target);
  const early = vi.fn<(payload: unknown) => void>();
  handle.on('loaded', early);
  await expect.poll(() => early).toHaveBeenCalledOnce();

  const late = vi.fn<(payload: unknown) => void>();
  handle.on('loaded', late);
  target.querySelector('iframe')!.src = `${formUrl}?height=480&events&embed=1`;

  await expect.poll(() => early).toHaveBeenCalledTimes(2);
  expect(late).toHaveBeenCalledOnce();
});

test('a throwing listener is reported and the next listener still runs', async () => {
  const reportError = vi.spyOn(window, 'reportError').mockImplementation(() => {});
  const error = new Error('listener failed');
  const handle = embedEvents(mount());
  handle.on('loaded', () => {
    throw error;
  });
  const next = vi.fn<(payload: unknown) => void>();
  handle.on('loaded', next);

  await expect.poll(() => next).toHaveBeenCalledOnce();
  expect(reportError).toHaveBeenCalledExactlyOnceWith(error);
});

test('a listener that re-adds itself during dispatch runs once per event', async () => {
  const handle = embedEvents(mount());
  let calls = 0;
  // Capped, so the bug fails the test instead of freezing the page.
  const listener = () => {
    calls += 1;
    off();
    if (calls < 10) {
      off = handle.on('loaded', listener);
    }
  };
  let off = handle.on('loaded', listener);

  await expect.poll(() => calls).toBeGreaterThan(0);
  expect(calls).toBe(1);
});

test('events from one embed do not reach the listeners of another', async () => {
  const own = vi.fn<(payload: unknown) => void>();
  embedEvents(mount()).on('loaded', own);
  const second = mount();
  const other = vi.fn<(payload: unknown) => void>();
  const handle = embed(second, `${formUrl}?height=700`);
  handles.push(handle);
  handle.on('loaded', other);

  await expect.poll(() => own).toHaveBeenCalledOnce();
  await expect.poll(() => second.querySelector('iframe')!.style.height).toBe('700px');
  expect(other).not.toHaveBeenCalled();
});

test.each([
  ['connecting', () => createElement(`${formUrl}?height=420`, answers)],
  [
    'upgrading',
    () => {
      const element = document.implementation
        .createHTMLDocument()
        .createElement('rooks-embed') as RooksEmbedElement;
      element.answers = answers;
      element.setAttribute('src', `${formUrl}?height=420`);
      element.className = 'embed-test';
      element.addEventListener('redirect', (event) => event.preventDefault());
      return element;
    },
  ],
])('<rooks-embed> sends answers set before %s', async (_, create) => {
  const element = create();
  document.body.append(element);

  const frame = frameOf(element)!;
  expect(new URL(frame.src).searchParams.get('embed')).toBe('answers');
  // The fixture reports a height only after it gets the expected answers.
  await expect.poll(() => frame.style.height).toBe('420px');
});

test('<rooks-embed> fires form events with the payload as detail, without bubbling', async () => {
  const element = createElement(`${formUrl}?height=420&events`);
  const details: Record<string, unknown> = {};
  const bubbled = vi.fn<(event: Event) => void>();
  const names = ['loaded', 'pageLoaded', 'pageCompleted', 'responsesSaved', 'completed'] as const;
  for (const name of names) {
    element.addEventListener(name, (event) => {
      details[name] = event.detail;
    });
    document.addEventListener(name, bubbled);
  }
  document.body.append(element);

  try {
    await expect
      .poll(() => details)
      .toEqual({
        loaded,
        pageLoaded: page,
        pageCompleted: page,
        responsesSaved: loaded,
        completed: loaded,
      });
    expect(bubbled).not.toHaveBeenCalled();
  } finally {
    names.forEach((name) => document.removeEventListener(name, bubbled));
  }
});

test.each([
  [
    'an equal answers value',
    false,
    (element: RooksEmbedElement) => {
      element.answers = { count: 3, enabled: true, choices: ['test'] };
    },
  ],
  [
    'equal answers in a different key order',
    false,
    (element: RooksEmbedElement) => {
      element.answers = { choices: ['test'], enabled: true, count: 3 };
    },
  ],
  [
    'changed answers',
    true,
    (element: RooksEmbedElement) => {
      element.answers = { count: 4, enabled: true, choices: ['test'] };
    },
  ],
  [
    'a changed src',
    true,
    (element: RooksEmbedElement) => {
      element.setAttribute('src', `${formUrl}?height=480`);
    },
  ],
])('<rooks-embed> given %s recreates the iframe: %s', async (_, recreated, change) => {
  const element = createElement(`${formUrl}?height=420`, answers);
  document.body.append(element);
  const before = frameOf(element);
  await expect.poll(() => before!.style.height).toBe('420px');

  change(element);

  expect(element.shadowRoot!.querySelectorAll('iframe')).toHaveLength(1);
  expect(frameOf(element) !== before).toBe(recreated);
});

test('<rooks-embed> does not navigate when the redirect event is canceled', async () => {
  const element = document.createElement('rooks-embed');
  element.className = 'embed-test';
  element.answers = answers;
  element.setAttribute('src', `${formUrl}?height=420`);
  const urls: string[] = [];
  element.addEventListener('redirect', (event) => {
    urls.push(event.detail.url);
    event.preventDefault();
  });
  document.body.append(element);

  await expect.poll(() => urls).toEqual([`${formUrl}#complete`]);
});

test.each([
  ['the form does not respond', `${formUrl}?silent`],
  ['src is not an HTTP(S) URL', 'javascript:void(0)'],
])('<rooks-embed> fires a cancelable error event when %s', async (_, src) => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const reportError = vi.spyOn(window, 'reportError');
  const element = createElement(src);
  const errors: unknown[] = [];
  element.addEventListener('error', (event) => {
    errors.push(event.detail);
    event.preventDefault();
  });
  document.body.append(element);

  await vi.runAllTimersAsync();
  expect(errors).toHaveLength(1);
  expect(errors[0]).toBeInstanceOf(Error);
  expect(reportError).not.toHaveBeenCalled();
});

test('removing <rooks-embed> removes its iframe and stops answering ready signals', async () => {
  const element = createElement(`${formUrl}?height=420`);
  document.body.append(element);
  const frame = frameOf(element)!;
  await expect.poll(() => frame.style.height).toBe('420px');

  element.remove();
  expect(frameOf(element)).toBeNull();

  const formLoaded = nextFixtureMessage('fixture-loaded', formUrl.origin);
  frame.src = `${formUrl}?height=480&embed=1`;
  mount().append(frame);
  await formLoaded;
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(frame.style.height).toBe('420px');
});
