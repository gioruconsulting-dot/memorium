import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanFilename } from './clean-filename.js';

// Extension stripping
test('strips .md extension', () => {
  assert.equal(cleanFilename('my-doc.md'), 'My doc');
});

test('strips .txt extension', () => {
  assert.equal(cleanFilename('my-doc.txt'), 'My doc');
});

test('strips .markdown extension', () => {
  assert.equal(cleanFilename('my-doc.markdown'), 'My doc');
});

test('strips extension case-insensitively (.MD)', () => {
  assert.equal(cleanFilename('my-doc.MD'), 'My doc');
});

test('does not strip unrecognised extensions', () => {
  assert.equal(cleanFilename('my-doc.pdf'), 'My doc.pdf');
});

// Separator-to-space conversion
test('converts hyphens to spaces', () => {
  assert.equal(cleanFilename('hello-world.md'), 'Hello world');
});

test('converts underscores to spaces', () => {
  assert.equal(cleanFilename('hello_world.md'), 'Hello world');
});

test('collapses runs of hyphens into a single space', () => {
  assert.equal(cleanFilename('hello---world.md'), 'Hello world');
});

test('collapses runs of underscores into a single space', () => {
  assert.equal(cleanFilename('hello___world.md'), 'Hello world');
});

test('collapses mixed separator runs into a single space', () => {
  assert.equal(cleanFilename('hello-_-world.md'), 'Hello world');
});

// Title-casing: first token Title-cased, rest lowercased
test('title-cases first token', () => {
  assert.equal(cleanFilename('introduction to physics.md'), 'Introduction to physics');
});

test('lowercases non-first tokens', () => {
  assert.equal(cleanFilename('Introduction To Physics.md'), 'Introduction to physics');
});

test('lowercases a capitalised non-first token', () => {
  assert.equal(cleanFilename('getting-Started-With-Node.md'), 'Getting started with node');
});

test('single-word filename is title-cased', () => {
  assert.equal(cleanFilename('readme.md'), 'Readme');
});

// Acronym preservation
test('preserves LLM in uppercase (non-first token)', () => {
  assert.equal(cleanFilename('intro-to-LLM.md'), 'Intro to LLM');
});

test('preserves LLM in uppercase (first token)', () => {
  assert.equal(cleanFilename('LLM-guide.md'), 'LLM guide');
});

test('preserves API in uppercase', () => {
  assert.equal(cleanFilename('building-an-API.md'), 'Building an API');
});

test('preserves multiple acronyms', () => {
  assert.equal(cleanFilename('LLM-and-API-guide.md'), 'LLM and API guide');
});

test('recognises acronym regardless of input case', () => {
  assert.equal(cleanFilename('intro-to-llm.md'), 'Intro to LLM');
});

test('preserves AI in uppercase', () => {
  assert.equal(cleanFilename('what-is-AI.txt'), 'What is AI');
});
