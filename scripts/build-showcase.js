const { buildShowcase } = require('../plugin/ipc/showcase');

const result = buildShowcase({
  outDir: require('path').join(__dirname, '..', 'showcase')
});

console.log(`Showcase written: ${result.path} (${result.count} items)`);
