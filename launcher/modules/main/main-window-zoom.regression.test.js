const assert = require('assert');
const zoom = require('./main-window-zoom');

function createFakeWebContents(initialLevel = 0) {
  let zoomLevel = initialLevel;
  return {
    isDestroyed: () => false,
    getZoomLevel: () => zoomLevel,
    setZoomLevel: (next) => {
      zoomLevel = next;
    },
    on: () => {}
  };
}

function testClampAndPercent() {
  assert.equal(zoom.clampZoomLevel(-999), -4);
  assert.equal(zoom.clampZoomLevel(999), 5);
  assert.equal(zoom.clampZoomLevel(1.5), 1.5);
  assert.equal(zoom.getZoomPercent(0), 100);
  assert.equal(zoom.getZoomPercent(1), 120);
}

function testApplyDeltaAndReset() {
  const webContents = createFakeWebContents(0);
  const increased = zoom.applyZoomDelta(webContents, 0.5);
  assert.equal(increased.success, true);
  assert.equal(increased.zoomLevel, 0.5);

  const decreased = zoom.applyZoomDelta(webContents, -1);
  assert.equal(decreased.success, true);
  assert.equal(decreased.zoomLevel, -0.5);

  const reset = zoom.resetZoom(webContents);
  assert.equal(reset.success, true);
  assert.equal(reset.zoomLevel, 0);
  assert.equal(reset.zoomPercent, 100);
}

function testDestroyedWebContentsFailsCleanly() {
  const result = zoom.applyZoomDelta({ isDestroyed: () => true }, 1);
  assert.equal(result.success, false);
}

testClampAndPercent();
testApplyDeltaAndReset();
testDestroyedWebContentsFailsCleanly();
console.log('main-window-zoom regression tests passed');
