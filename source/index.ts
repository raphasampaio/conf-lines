import Conf, {type Options as ConfOptions} from 'conf';

/**
Write the store as JSON Lines, one record per line in the order of their indexes, which is the order JavaScript enumerates integer keys in. An index that holds no record has no line, so the records after it move up.
*/
const serialize = (store: Record<string, unknown>): string => Object.entries(store)
	.map(([key, record]) => {
		// A named key has no line to go on, so it is refused rather than lost.
		if (!/^(?:0|[1-9]\d*)$/.test(key)) {
			throw new TypeError(`A conf-lines key must be a line index, such as \`0\`, got \`${key}\``);
		}

		return JSON.stringify(record);
	})
	// A record JSON writes as nothing, such as a function, is left out, the way a whole-store write of conf leaves it out.
	.filter(line => line !== undefined)
	.map(line => `${line}\n`)
	.join('');

/**
Read JSON Lines, where each line that is not blank is the record at the next index. A text editor can save a file with a byte order mark, which is not part of the JSON, so it is skipped.
*/
const deserialize = (text: string): Record<string, unknown> => {
	try {
		return {...text.replace(/^\uFEFF/, '').split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line) as unknown)};
	} catch {
		// The error of `JSON.parse` quotes the file around the failure, which is where a config keeps what the caller did not mean to put in a log. A `SyntaxError` is what `clearInvalidConfig` clears for.
		throw new SyntaxError('The config file is not valid JSON Lines.');
	}
};

const toKey = (key: unknown): unknown => (Number.isSafeInteger(key) && (key as number) >= 0 ? String(key) : key);

// Migrations keep their version under a named key, which a line cannot hold.
export type Options<T extends Record<string, any>> = Omit<ConfOptions<T>, 'migrations' | 'beforeEachMigration' | 'projectVersion'>;

// `Item` is the type of a record. Conf keeps the records in an object keyed by line index.
export default class ConfLines<Item = unknown> extends Conf<Record<number, Item>> {
	constructor(options?: Options<Record<number, Item>>) {
		super({
			fileExtension: 'jsonl',
			serialize,
			deserialize,
			...options,
		} as ConfOptions<Record<number, Item>>);
	}

	// The records in line order. Conf assigns the object it keeps them in when it writes the whole store, so that is taken as well.
	override get store(): Item[] {
		return Object.values(super.store);
	}

	override set store(records: Item[] | Record<number, Item>) {
		super.store = {...records};
	}

	// The index of a record is a number, where conf yields the string key of the object it keeps the records in.
	override * [Symbol.iterator](): IterableIterator<[number, Item]> {
		for (const [key, record] of super[Symbol.iterator]()) {
			yield [Number(key), record];
		}
	}
}

// Conf takes a key as a string, so a line index given as a number is passed on as the string it stands for. The methods are wrapped rather than overridden, which keeps the typed overloads of conf.
for (const name of ['get', 'set', 'has', 'delete', 'appendToArray', 'onDidChange', 'reset'] as const) {
	const method = Conf.prototype[name] as (this: Conf, ...arguments_: unknown[]) => unknown;
	(ConfLines.prototype as unknown as Record<string, unknown>)[name] = function (this: Conf, ...arguments_: unknown[]) {
		// Every argument of `reset()` is a key, and only the first of the others is.
		return method.apply(this, arguments_.map((argument, index) => (index === 0 || name === 'reset' ? toKey(argument) : argument)));
	};
}

export type {Schema} from 'conf';
