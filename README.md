# conf-lines

> Simple JSON Lines config handling for your app or module

[`conf`](https://github.com/sindresorhus/conf) with the store kept as [JSON Lines](https://jsonlines.org): line N of `config.jsonl` is the record at index N.

## Install

```sh
npm install conf-lines
```

## Usage

```js
import ConfLines from 'conf-lines';

const config = new ConfLines({projectName: 'foo'});

config.set(0, {name: 'alice'});
config.set(1, {name: 'bob'});
config.set(config.size, {name: 'carol'}); // Appends

console.log(config.get(1));
//=> {name: 'bob'}

console.log(config.get('0.name'));
//=> 'alice'

config.delete(0);
console.log(config.get(0));
//=> {name: 'bob'}
```

`config.jsonl` then holds:

```jsonl
{"name":"bob"}
{"name":"carol"}
```

## How it differs from `conf`

Every option and method is [`conf`'s](https://github.com/sindresorhus/conf#api), with these differences:

- A key is a line index: a number such as `0`, or a string such as `'0'` or, with dot notation, `'0.name'`. A named key such as `'foo'` throws a `TypeError` when the store is written. In TypeScript, `new ConfLines<Note>()` types each record; a dot path is typed only for `.get()` and `.set()`.
- `.delete(index)` removes the line, so the records after it move up one index. Setting an index past the end writes the record as the next line.
- `fileExtension` defaults to `'jsonl'`. Blank lines and a leading byte order mark are skipped when reading.
- The `migrations`, `beforeEachMigration` and `projectVersion` options are not available, since migrations keep their version under a named key.
- `defaults` must give records at consecutive indexes from `0`, since a gap moves the later ones up.
- `.store` is the records as an array, and assigning an array to it writes them as the lines. Iterating the store yields `[index, record]` with the index as a number.

To validate every record, use `rootSchema`:

```js
const config = new ConfLines({
	projectName: 'foo',
	rootSchema: {
		additionalProperties: {
			type: 'object',
			properties: {
				name: {type: 'string'},
			},
			required: ['name'],
		},
	},
});
```
