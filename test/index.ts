/* eslint-disable @typescript-eslint/naming-convention -- the keys of a store are line indexes */
import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {temporaryDirectory} from 'tempy';
import ConfLines from '../source/index.js';

type Person = {name: string};

const fileOf = (config: ConfLines<any>): string => fs.readFileSync(config.path, 'utf8');

const withRecords = (...names: string[]): ConfLines<Record<number, Person>> => {
	const config = new ConfLines<Record<number, Person>>({cwd: temporaryDirectory()});
	for (const name of names) {
		config.set(config.size, {name});
	}

	return config;
};

describe('the file', () => {
	it('is `config.jsonl` with one compact line per record', () => {
		const config = withRecords('alice', 'bob');
		assert.equal(path.basename(config.path), 'config.jsonl');
		assert.equal(fileOf(config), '{"name":"alice"}\n{"name":"bob"}\n');
	});

	it('takes any JSON value as a record', () => {
		const config = new ConfLines({cwd: temporaryDirectory()});
		config.set(0, 'text');
		config.set(1, [1, 2]);
		config.set(2, null);
		assert.equal(fileOf(config), '"text"\n[1,2]\nnull\n');
		assert.equal(config.get(2), null);
		assert.equal(config.has('1.0'), true);
		config.delete('1.0');
		assert.deepEqual(config.get(1), [2]);
	});

	it('yields each record with its index as a number', () => {
		const config = withRecords('alice', 'bob');
		assert.deepEqual([...config], [[0, {name: 'alice'}], [1, {name: 'bob'}]]);
	});

	it('reads a byte order mark, CRLF and blank lines', () => {
		const cwd = temporaryDirectory();
		fs.writeFileSync(path.join(cwd, 'config.jsonl'), '﻿{"name":"alice"}\r\n\r\n{"name":"bob"}\r\n');
		const config = new ConfLines<Record<number, Person>>({cwd});
		assert.equal(config.get(1)?.name, 'bob');
		assert.equal(config.size, 2);
	});

	it('refuses a line that is not JSON without quoting it, and clears it with `clearInvalidConfig`', () => {
		const cwd = temporaryDirectory();
		fs.writeFileSync(path.join(cwd, 'config.jsonl'), '{"name":"alice"}\n{secret\n');
		assert.throws(() => new ConfLines({cwd}), (error: Error) => error instanceof SyntaxError && error.message.includes('not valid JSON Lines') && !error.message.includes('secret'));
		assert.equal(new ConfLines({cwd, clearInvalidConfig: true}).size, 0);
	});
});

describe('a line index', () => {
	it('reads a record by number, by string and by dot path', () => {
		const config = withRecords('alice', 'bob');
		assert.deepEqual(config.get(1), {name: 'bob'});
		assert.deepEqual(config.get('1'), {name: 'bob'});
		assert.equal(config.get('0.name'), 'alice');
		assert.equal(config.has(1), true);
		assert.equal(config.has(2), false);
	});

	it('replaces a record, appends at the end, and writes an index past the end as the next line', () => {
		const config = withRecords('alice', 'bob');
		config.set(0, {name: 'ada'});
		config.set(9, {name: 'carol'});
		assert.equal(fileOf(config), '{"name":"ada"}\n{"name":"bob"}\n{"name":"carol"}\n');
		assert.deepEqual(config.get(2), {name: 'carol'});
	});

	for (const cache of [false, true]) {
		it(`moves the records after a deleted one up${cache ? ' with the cache' : ''}`, () => {
			const config = new ConfLines<Record<number, Person>>({cwd: temporaryDirectory(), cache});
			config.set({0: {name: 'alice'}, 1: {name: 'bob'}, 2: {name: 'carol'}});
			assert.deepEqual(config.get(1), {name: 'bob'});
			config.delete(1);
			assert.deepEqual(config.get(1), {name: 'carol'});
			assert.equal(config.size, 2);
		});
	}

	it('refuses a named key', () => {
		const config = withRecords('alice');
		assert.throws(() => {
			config.set('foo', 1);
		}, {name: 'TypeError', message: /must be a line index/});
		assert.equal(fileOf(config), '{"name":"alice"}\n');
	});

	it('refuses a number that is not a line index', () => {
		const config = withRecords('alice');
		assert.throws(() => config.get(-1), TypeError);
		assert.throws(() => config.get(1.5), TypeError);
	});
});

describe('conf options', () => {
	it('fill in `defaults` by index, without typing the store as the indexes they name', () => {
		const config = new ConfLines({cwd: temporaryDirectory(), defaults: {0: {name: 'alice'}}});
		assert.equal(config.get('0.name'), 'alice');
		config.set(0, {name: 'bob'});
		config.set(1, {name: 'carol'});
		config.reset(0);
		config.reset();
		assert.equal(config.get('0.name'), 'alice');
	});

	it('validate every record with `rootSchema`', () => {
		const config = new ConfLines({
			cwd: temporaryDirectory(),
			rootSchema: {additionalProperties: {type: 'object', required: ['name']}},
		});
		config.set(0, {name: 'alice'});
		assert.throws(() => {
			config.set(1, {age: 1});
		}, /must have required property 'name'/);
	});

	it('encrypt the file', () => {
		const cwd = temporaryDirectory();
		withRecords('alice');
		new ConfLines({cwd, encryptionKey: 'key'}).set(0, {name: 'alice'});
		assert.ok(!fs.readFileSync(path.join(cwd, 'config.jsonl'), 'utf8').includes('alice'));
		assert.equal(new ConfLines({cwd, encryptionKey: 'key'}).get('0.name'), 'alice');
	});

	it('report a change to a record watched by index', () => {
		const config = withRecords('alice');
		const seen: unknown[] = [];
		config.onDidChange(0, (newValue, oldValue) => seen.push(oldValue, newValue));
		config.set(0, {name: 'bob'});
		assert.deepEqual(seen, [{name: 'alice'}, {name: 'bob'}]);
	});
});
