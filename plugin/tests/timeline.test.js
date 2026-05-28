const assert = require('assert');
const { buildTimelinePrompt, normalizeSelectedClips, normalizeTimelineContext, timecodeToSeconds } = require('../ipc/timeline');

assert.strictEqual(timecodeToSeconds('01:02:03:12', 24), 3723.5);

const context = normalizeTimelineContext({
  available: true,
  projectName: 'Project',
  timelineName: 'Timeline 1',
  fps: '25',
  width: '1920',
  height: '1080',
  currentTimecode: '00:00:10:00',
  selectedClips: [{ name: 'Interview A', startFrame: 20, endFrame: 80, mediaType: 'Video' }]
}, { fps: 30, width: 1280, height: 720 });

assert.strictEqual(context.fps, 25);
assert.strictEqual(context.width, 1920);
assert.strictEqual(context.playheadFrame, 250);
assert.strictEqual(context.selectedClips.length, 1);

const prompt = buildTimelinePrompt({ type: 'lower-third', context });
assert(prompt.includes('lower third'));
assert(prompt.includes('Timeline 1'));
assert(prompt.includes('1920x1080'));
assert(prompt.includes('00:00:10:00'));
assert(prompt.includes('Interview A'));

const clips = normalizeSelectedClips({ a: { 'Clip Name': 'Clip A' }, b: { fileName: 'clip-b.mov' } });
assert.strictEqual(clips.length, 2);
assert.strictEqual(clips[0].name, 'Clip A');

console.log('timeline tests passed');
