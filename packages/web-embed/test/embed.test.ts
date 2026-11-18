import { afterEach, expect, test, vi } from 'vitest';
import { embed } from '../src/index.js';

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

afterEach(() => {
  document.querySelectorAll('.embed-test').forEach((target) => target.remove());
  vi.useRealTimers();
});

test('cross-origin forms get their own ports, including after a reload', async () => {
  const first = mount();
  first.id = 'intake';
  const second = mount();
  const onRedirect = vi.fn<(url: string) => boolean>(() => false);
  const intake = embed('#intake', `${formUrl}?height=420`, {
    answers: { count: 3, enabled: true, choices: ['test'] },
    onRedirect,
  });
  const other = embed(second, `${formUrl}?height=700`);

  try {
    const intakeFrame = first.querySelector('iframe')!;
    const otherFrame = second.querySelector('iframe')!;
    expect(formUrl.origin).not.toBe(location.origin);
    expect(new URL(intakeFrame.src).search).toBe('?height=420&embed=answers');
    await expect.poll(() => intakeFrame.style.height).toBe('420px');
    await expect.poll(() => onRedirect).toHaveBeenCalledWith(`${formUrl}#complete`);
    await expect.poll(() => otherFrame.style.height).toBe('700px');

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
        `Rooks form did not respond. Add ${location.origin} to the form’s allowed domains.`,
      ),
    );
  } finally {
    handle.destroy();
  }
});
