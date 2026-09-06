// tests/navigation-state.test.js - Unit tests for presentation navigation and curtain state
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');

class PresentationStateMachine {
  constructor(totalPages = 6) {
    this.totalPages = totalPages;
    this.currentPage = 1;
    this.blankMode = 'none'; // 'none' | 'black' | 'white'
    this.isTransitioning = false;
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      return true;
    }
    return false;
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      return true;
    }
    return false;
  }

  goToPage(pageNum) {
    const target = Number(pageNum);
    if (!Number.isInteger(target)) return false;
    if (target >= 1 && target <= this.totalPages) {
      this.currentPage = target;
      return true;
    }
    return false;
  }

  toggleBlackout() {
    this.blankMode = (this.blankMode === 'black' ? 'none' : 'black');
    return this.blankMode;
  }

  toggleWhiteout() {
    this.blankMode = (this.blankMode === 'white' ? 'none' : 'white');
    return this.blankMode;
  }

  clearCurtain() {
    this.blankMode = 'none';
  }
}

describe('Presentation Navigation State Machine', () => {
  let sm;

  beforeEach(() => {
    sm = new PresentationStateMachine(6);
  });

  test('Starts on Slide 1 of 6 with no curtain', () => {
    assert.strictEqual(sm.currentPage, 1);
    assert.strictEqual(sm.totalPages, 6);
    assert.strictEqual(sm.blankMode, 'none');
  });

  test('prevPage on page 1 does not decrement below 1', () => {
    const moved = sm.prevPage();
    assert.strictEqual(moved, false);
    assert.strictEqual(sm.currentPage, 1);
  });

  test('nextPage advances page sequentially up to totalPages', () => {
    for (let p = 1; p < 6; p++) {
      const moved = sm.nextPage();
      assert.strictEqual(moved, true);
      assert.strictEqual(sm.currentPage, p + 1);
    }

    assert.strictEqual(sm.currentPage, 6);
    // Attempting next page at totalPages
    const movedPastEnd = sm.nextPage();
    assert.strictEqual(movedPastEnd, false);
    assert.strictEqual(sm.currentPage, 6);
  });

  test('goToPage respects bounds strictly', () => {
    assert.strictEqual(sm.goToPage(3), true);
    assert.strictEqual(sm.currentPage, 3);

    // Invalid bounds
    assert.strictEqual(sm.goToPage(0), false);
    assert.strictEqual(sm.currentPage, 3);

    assert.strictEqual(sm.goToPage(-10), false);
    assert.strictEqual(sm.currentPage, 3);

    assert.strictEqual(sm.goToPage(7), false);
    assert.strictEqual(sm.currentPage, 3);

    assert.strictEqual(sm.goToPage(999), false);
    assert.strictEqual(sm.currentPage, 3);

    assert.strictEqual(sm.goToPage('invalid'), false);
    assert.strictEqual(sm.currentPage, 3);

    // Valid boundary jumps
    assert.strictEqual(sm.goToPage(1), true);
    assert.strictEqual(sm.currentPage, 1);

    assert.strictEqual(sm.goToPage(6), true);
    assert.strictEqual(sm.currentPage, 6);
  });

  test('Blackout curtain toggles correctly', () => {
    assert.strictEqual(sm.blankMode, 'none');

    assert.strictEqual(sm.toggleBlackout(), 'black');
    assert.strictEqual(sm.blankMode, 'black');

    assert.strictEqual(sm.toggleBlackout(), 'none');
    assert.strictEqual(sm.blankMode, 'none');
  });

  test('Whiteout curtain toggles correctly', () => {
    assert.strictEqual(sm.blankMode, 'none');

    assert.strictEqual(sm.toggleWhiteout(), 'white');
    assert.strictEqual(sm.blankMode, 'white');

    assert.strictEqual(sm.toggleWhiteout(), 'none');
    assert.strictEqual(sm.blankMode, 'none');
  });

  test('Toggling blackout while whiteout is active switches to black', () => {
    sm.toggleWhiteout();
    assert.strictEqual(sm.blankMode, 'white');

    sm.toggleBlackout();
    assert.strictEqual(sm.blankMode, 'black');

    sm.clearCurtain();
    assert.strictEqual(sm.blankMode, 'none');
  });
});
