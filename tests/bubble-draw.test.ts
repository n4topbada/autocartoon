import assert from "node:assert/strict";
import test from "node:test";
import { createBubble, drawBubble } from "../src/lib/bubble-draw";

function fakeContext() {
  const calls: Array<{ name: string; args: number[] }> = [];
  const record = (name: string) => (...args: number[]) => calls.push({ name, args });
  const context = {
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    save: record("save"),
    restore: record("restore"),
    beginPath: record("beginPath"),
    closePath: record("closePath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    ellipse: record("ellipse"),
    quadraticCurveTo: record("quadraticCurveTo"),
    fill: record("fill"),
    stroke: record("stroke"),
    setLineDash: () => undefined,
  } as unknown as CanvasRenderingContext2D;
  return { context, calls };
}

test("rounded rectangle speech bubble draws its body and tail as one outline", () => {
  const { context, calls } = fakeContext();
  const bubble = {
    ...createBubble("roundedRectangle", 100, 100),
    text: "",
    tailEnabled: true,
    tailTipX: 100,
    tailTipY: 205,
  };

  drawBubble(context, bubble);

  assert.equal(calls.filter((call) => call.name === "beginPath").length, 1);
  assert.equal(calls.filter((call) => call.name === "fill").length, 1);
  assert.equal(calls.filter((call) => call.name === "stroke").length, 1);
  assert.ok(calls.some((call) => call.name === "lineTo" && call.args[0] === 100 && call.args[1] === 205));
});

test("cloud bubble keeps visible scallops even at default roughness", () => {
  const { context, calls } = fakeContext();
  const bubble = {
    ...createBubble("cloud", 100, 100),
    text: "",
    width: 200,
    height: 120,
    tailEnabled: true,
    tailTipX: 100,
    tailTipY: 210,
  };

  drawBubble(context, bubble);

  const curves = calls.filter((call) => call.name === "quadraticCurveTo");
  assert.ok(curves.length >= 10);
  assert.ok(curves.some((call) => call.args[0] < 0 || call.args[0] > 200 || call.args[1] < 40 || call.args[1] > 160));
  assert.equal(calls.filter((call) => call.name === "fill").length, 1);
  assert.equal(calls.filter((call) => call.name === "stroke").length, 1);
  assert.ok(calls.some((call) => call.name === "lineTo" && call.args[0] === 100 && call.args[1] === 210));
});

test("ellipse speech bubble keeps its tail in the same outline", () => {
  const { context, calls } = fakeContext();
  const bubble = {
    ...createBubble("ellipse", 100, 100),
    text: "",
    tailEnabled: true,
    tailTipX: 100,
    tailTipY: 210,
  };

  drawBubble(context, bubble);

  assert.equal(calls.filter((call) => call.name === "beginPath").length, 1);
  assert.equal(calls.filter((call) => call.name === "fill").length, 1);
  assert.equal(calls.filter((call) => call.name === "stroke").length, 1);
  assert.ok(calls.some((call) => call.name === "lineTo" && call.args[0] === 100 && call.args[1] === 210));
});
