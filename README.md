# Jsonder

Provides a simple interface for creating unified JSON API responses in Express.js apps.

## Installation

You can install Jsonder using NPM:

```sh
npm install jsonder
```

## Basic usage

```js
import jsonder from 'jsonder'.

const api = jsonder();
```

Jsonder provides two basic methods for handling API responses: `sendSuccess` and `sendFail`. These methods take a response object `res` and either a resource to send or an error, respectively.

**Successful response**:

```js
api.sendSuccess(res, { id: '123456', greeting: 'Hello, World!' });
```

Each resource must have an `id` field of type `string`.

You can also provid an array of resources to send.

```js
api.sendSuccess(res, [
  { id: '123456', greeting: 'Hello, World!' },
  { id: '123457', greeting: 'Hi, World!' },
]);
```

**Error Response**:

Each error must have these fields:

- `status`: a HTTP status of the error
- `code`: a human readable code of the error as a `string`,
- `detail`: a detailed human readable explanation of the error.

```js
jsonder.sendFail(res, { 
  status: 400,
  code: 'invalid_body',
  detail: 'you forgot to provide a body'
});
```

You can provide an array of errors. Jsonder will choose the most general HTTP status code for the whole reqeust. 
