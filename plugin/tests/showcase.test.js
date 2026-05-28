const assert = require('assert');
const { buildShowcaseHtml } = require('../ipc/showcase');

const html = buildShowcaseHtml([{
  title: 'Creator Title',
  category: 'creator',
  prompt: 'Create a creator title card',
  thumbnail: 'thumb.png',
  tags: ['title']
}]);

assert(html.includes('Resolve AI Showcase'));
assert(html.includes('Creator Title'));
assert(html.includes('copyPrompt'));
assert(html.includes('Create a creator title card'));

console.log('showcase tests passed');
