# @rooks-ai/web-embed

Embed Rooks forms in web pages.

## Embed a form

Publish your form and add your host page's origin (for example, `https://www.example.com`) to the
form's allowed domains. Use the final published form URL, including its custom domain if it has one.

### With a package manager

```sh
pnpm add @rooks-ai/web-embed@VERSION
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
  src="https://cdn.jsdelivr.net/npm/@rooks-ai/web-embed@VERSION/dist/index.umd.js"
  integrity="sha384-INTEGRITY"
  crossorigin="anonymous"
></script>
<script>
  const form = RooksWebEmbed.embed('#intake', 'https://acme.rooks.app/form/intake');
</script>
```

## API

`embed(target, formUrl, options?)` accepts a CSS selector or DOM element and an absolute HTTP(S)
form URL. It returns a handle with `destroy()`, which removes the iframe and its listeners.

| Option            | Behavior                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `answers`         | Optional object keyed by form answer name. Values can be strings, numbers, booleans, `null`, arrays, or objects. The SDK sends these directly to the iframe after it is ready.                                           |
| `height`          | Defaults to `'auto'`, which follows the height reported by the form. Pass a number for a fixed height in pixels.                                                                                                         |
| `onRedirect(url)` | Called with a resolved HTTP(S) URL before navigating the host page. Return `false` to cancel the navigation.                                                                                                             |
| `onError(error)`  | Called if the form gives no ready signal within 10 seconds. Check the form URL and the host origin named in the error. The browser reports the error by default. The embed still initializes if the form responds later. |

The SDK keeps initial answers out of the iframe URL and sends them directly to the form's origin
after it signals that it is ready. The handshake repeats on reload. A different page loaded into
the iframe on the same origin can also receive those answers if it signals that it is ready.
