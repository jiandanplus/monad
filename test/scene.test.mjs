import test from "node:test";
import assert from "node:assert/strict";
import { createLayout, districtCenter, pickDistrict } from "../src/scene-math.mjs";
for (const [width, height] of [[1100, 620], [390, 330], [720, 330]]) {
    test(`top-down regions and labels remain selectable ${width}x${height}`, () => {
        const l = createLayout(width, height);
        for (let i = 0; i < 9; i++) {
            const p = districtCenter(l, i);
            assert.equal(pickDistrict(l, p.x, p.y), i);
            assert.equal(pickDistrict(l, p.x, p.y + l.cellH * .30), i);
        }
        const a = districtCenter(l, 0), b = districtCenter(l, 1), c = districtCenter(l, 3);
        assert.equal(a.y, b.y, "horizontal road stays horizontal");
        assert.equal(a.x, c.x, "vertical road stays vertical");
        assert.ok(a.x < b.x && a.y < c.y);
        assert.equal(pickDistrict(l, -1, 0), null);
        assert.equal(pickDistrict(l, width, height), null);
        assert.equal(pickDistrict(l, NaN, 2), null);
        assert.equal(pickDistrict(l, l.left, l.top), 0);
        assert.equal(pickDistrict(l, l.left + l.cellW * 3, l.top), null);
        assert.equal(pickDistrict(l, l.left, l.top + l.cellH * 3), null);
        assert.equal(pickDistrict(l, l.left + l.cellW, l.top), 1);
    });
}
test("invalid dimensions and district IDs reject", () => {
    assert.throws(() => createLayout(0, 20));
    assert.throws(() => createLayout(20, NaN));
    assert.throws(() => districtCenter(createLayout(300, 300), 9));
});

import * as scene from "../src/scene-math.mjs";
test("confirmed event animation primes by deployment and round, independent of viewer resets", () => {
  assert.equal(typeof scene.createActivityGate, "function");
  const gate = scene.createActivityGate();
  const a = {hash:"0xa"}, b = {hash:"0xb"}, c = {hash:"0xc"};
  assert.deepEqual(gate.ingest("contractA:1", [a], true), []);
  assert.deepEqual(gate.ingest("contractA:1", [b,a], true), [b]);
  assert.deepEqual(gate.ingest("contractA:1", [b,a], true), []);
  // A viewer snapshot being cleared does not identify a round; the scope does.
  assert.deepEqual(gate.ingest("contractA:2", [c,b], true), []);
  assert.deepEqual(gate.ingest("contractB:2", [a,c], true), []);
});
test("practice log polling consumes confirmed hashes without replay on return to live", () => {
  assert.equal(typeof scene.createActivityGate, "function");
  const gate = scene.createActivityGate();
  const a = {hash:"0xa"}, b = {hash:"0xb"}, c = {hash:"0xc"};
  gate.ingest("contract:1", [a], false);
  assert.deepEqual(gate.ingest("contract:1", [b,a], false), []);
  assert.deepEqual(gate.ingest("contract:1", [c,b,a], true), [c]);
});

import {readFileSync} from "node:fs";
test("mobile dock with no live snapshot displays a waiting state, never a zero garrison", () => {
  const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const expression = source.match(/el\("dock-reason"\)\.textContent = (.*);/)[1];
  const renderReason = new Function("s", "canStart", "reason", "preview", "defense", "selected", `return (${expression});`);
  assert.equal(renderReason(null, false, "", null, Array(9).fill(0), 1), "等待链上快照");
  assert.equal(renderReason({}, true, "No round", null, Array(9).fill(0), 1), "发送交易开启 180 秒战斗");
  assert.equal(renderReason({}, false, "", {afterDefense:12}, [0,30], 1), "预计驻军 30 → 12");
});
