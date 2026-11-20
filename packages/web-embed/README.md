# @rooks-ai/web-embed

Embed Rooks forms in web pages.

## Embed a form

Publish your form and add your host page's origin (for example, `https://www.example.com`) to the
form's allowed domains. Use the final published form URL, including its custom domain if it has one.

### With a package manager

```sh
pnpm add @rooks-ai/web-embed@0.2.0
```

Add a container where the form should appear.

```html
<div id="intake"></div>
```

Call `embed()` in the browser once the container exists.

```js
import { embed } from '@rooks-ai/web-embed';

const form = embed('#intake', 'https://acme.rooks.app/form/intake', {
  answers: { first_name: 'Ada' },
});

// Call form.destroy() when the container is no longer needed.
```

### With a script tag

The script tag pins the package version and uses subresource integrity to verify the bundle.

```html
<div id="intake"></div>
<script
  src="https://cdn.jsdelivr.net/npm/@rooks-ai/web-embed@0.2.0/dist/index.umd.js"
  integrity="sha384-+kGVcM5/s6wFx6kwOoBXu0+gVljapJVuA1zhKFS0XfKXluvGmq7fiyjCnvgSPdt5"
  crossorigin="anonymous"
></script>
<script>
  const form = RooksWebEmbed.embed('#intake', 'https://acme.rooks.app/form/intake');
</script>
```

### With the `<rooks-embed>` element

Loading the SDK registers the `<rooks-embed>` element. Use the first `<script>` tag above (the one
with `integrity`), without the `RooksWebEmbed.embed()` call. With the package, import it once in
browser code:

```js
import '@rooks-ai/web-embed';
```

Then add the element where the form should appear.

```html
<rooks-embed src="https://acme.rooks.app/form/intake"></rooks-embed>
```

To send answers or listen for events, create the element in a script. Set `answers` before you
add the element to the page.

```js
const element = document.createElement('rooks-embed');
element.setAttribute('src', 'https://acme.rooks.app/form/intake');
element.answers = { first_name: 'Ada' };
element.addEventListener('completed', () => {
  showThankYouMessage();
});
document.querySelector('#intake').append(element);
```

## API

`embed(target, formUrl, options?)` accepts a CSS selector or DOM element and an absolute HTTP(S)
form URL. It returns a handle with `on()` and `destroy()`.

| Option            | Behavior                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `answers`         | Optional object keyed by form answer name. Values can be strings, numbers, booleans, `null`, arrays, or objects. The SDK sends these directly to the iframe after it is ready.                                           |
| `height`          | Defaults to `'auto'`, which follows the height reported by the form. Pass a number for a fixed height in pixels.                                                                                                         |
| `onRedirect(url)` | Called with a resolved HTTP(S) URL before navigating the host page. Return `false` to cancel the navigation.                                                                                                             |
| `onError(error)`  | Called if the form gives no ready signal within 10 seconds. Check the form URL and the host origin named in the error. The browser reports the error by default. The embed still initializes if the form responds later. |

`destroy()` removes the iframe and its listeners.

The SDK keeps initial answers out of the iframe URL and sends them directly to the form's origin
after it signals that it is ready. The handshake repeats on reload. A different page loaded into
the iframe on the same origin can also receive those answers if it signals that it is ready.

### Events

`form.on(name, listener)` adds a listener for a form event. `form` is the handle that `embed()`
returns. The listener gets the event payload. `on()` returns a function that removes that listener.

```js
const off = form.on('pageCompleted', ({ page }) => {
  updateProgressBar(page.index);
});

// Later, to stop listening:
off();
```

- A listener gets only events that happen after you add it. Past events are not sent again.
- Listeners keep working when the form reloads.
- If a listener throws, the browser reports the error. The other listeners still run.
- `on()` after `destroy()` adds nothing.

| Event            | When it fires                                                       | Payload                         |
| ---------------- | ------------------------------------------------------------------- | ------------------------------- |
| `loaded`         | The form loaded.                                                    | `{ responseId, answers }`       |
| `pageLoaded`     | The form shows a page.                                              | `{ responseId, answers, page }` |
| `pageCompleted`  | The responder completed a page.                                     | `{ responseId, answers, page }` |
| `responsesSaved` | The form saved the answers. It fires after each save, autosave too. | `{ responseId, answers }`       |
| `completed`      | The responder completed the form, after the last `responsesSaved`.  | `{ responseId, answers }`       |

- `responseId` is the ID of the responder.
- `answers` is an object keyed by the form's answer labels. It includes calculated variables.
- `page.index` is the position of the page, from 0.
- `page.id` is the page ID from the form. It is missing if the page has no ID.

If the form has a redirect, the redirect comes after `completed`.

Answers are often personal or health data. Do not log them or send them to analytics tools.

### `<rooks-embed>`

| Attribute | Behavior                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------- |
| `src`     | The absolute HTTP(S) form URL. Without `src`, the element shows nothing.                              |
| `height`  | `auto` (the default) follows the height reported by the form. A number sets a fixed height in pixels. |

`answers` is a JavaScript property, not an attribute. It takes the same object as the `answers`
option of `embed()`. Set it before you add the element to the page. If you set it to a different
value later, the form reloads. A value equal to the current one does not reload the form. Do not
put answers in the HTML or in the form URL.

A change to `src` or `height` also reloads the form. Removing the element removes the form.

The element fires the five events in the table above as `CustomEvent`s. `event.detail` is the
payload. The events do not bubble, so add listeners to the element itself.

```js
element.addEventListener('pageLoaded', (event) => {
  updateProgressBar(event.detail.page.index);
});
```

The element also fires two events that you can cancel with `event.preventDefault()`:

- `redirect`: the form asks to navigate the host page. `event.detail.url` is the resolved HTTP(S)
  URL. Cancel the event to stay on the page.
- `error`: the form did not respond within 10 seconds, or `src` is not an HTTP(S) URL.
  `event.detail` is the `Error`. If you do not cancel the event, the browser reports the error.

In TypeScript, `document.createElement('rooks-embed')` returns a `RooksEmbedElement`, and its
`addEventListener()` knows the type of each event's `detail`.
