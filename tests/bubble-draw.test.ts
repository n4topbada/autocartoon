import assert from "node:assert/strict";
import test from "node:test";
import { SPEECH_BUBBLE_PRESETS, createBubble, drawBubble } from "../src/lib/bubble-draw";

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
    arc: record("arc"),
    bezierCurveTo: record("bezierCurveTo"),
    quadraticCurveTo: record("quadraticCurveTo"),
    fill: record("fill"),
    stroke: record("stroke"),
    setLineDash: (values: number[]) => calls.push({ name: "setLineDash", args: values }),
  } as unknown as CanvasRenderingContext2D;
  return { context, calls };
}

test("speech balloon presets are unique and carry their intended defaults", () => {
  assert.equal(SPEECH_BUBBLE_PRESETS.length, 12);
  assert.equal(new Set(SPEECH_BUBBLE_PRESETS.map((preset) => preset.type)).size, SPEECH_BUBBLE_PRESETS.length);

  for (const preset of SPEECH_BUBBLE_PRESETS) {
    const bubble = createBubble(preset.type, 100, 100);
    assert.equal(bubble.tailEnabled, preset.tailEnabled);
    assert.equal(bubble.strokeStyle, preset.strokeStyle);
    assert.equal(bubble.strokeWidth, preset.strokeWidth);
  }
});

test("every pointer balloon draws its tail inside the same outline", () => {
  for (const preset of SPEECH_BUBBLE_PRESETS.filter((item) => item.tailEnabled && item.type !== "thought")) {
    const { context, calls } = fakeContext();
    const bubble = {
      ...createBubble(preset.type, 100, 100),
      text: "",
      tailTipX: 70,
      tailTipY: 215,
    };

    drawBubble(context, bubble);

    assert.ok(
      calls.some((call) => call.name === "lineTo" && call.args[0] === 70 && call.args[1] === 215),
      `${preset.type} did not integrate its tail tip into the outline`
    );
    assert.equal(calls.filter((call) => call.name === "fill").length, 1, `${preset.type} drew split fills`);
    assert.ok(calls.filter((call) => call.name === "stroke").length >= 1, `${preset.type} has no visible outline`);
  }
});

test("radial thought balloon uses a hidden ellipse and dense separated tapered lines", () => {
  const { context, calls } = fakeContext();
  const bubble = {
    ...createBubble("radialThought", 120, 100),
    id: "radial-thought-fixture",
    text: "",
    width: 240,
    height: 160,
  };

  drawBubble(context, bubble);

  assert.equal(bubble.tailEnabled, false);
  assert.equal(calls.filter((call) => call.name === "ellipse").length, 1);
  assert.equal(calls.filter((call) => call.name === "stroke").length, 0);
  assert.equal(calls.filter((call) => call.name === "fill").length, 2);
  assert.ok(calls.filter((call) => call.name === "closePath").length >= 100);
  assert.ok(calls.filter((call) => call.name === "lineTo").length >= 400);
});

test("thought balloon draws one cloud body and three intentional thought bubbles", () => {
  const { context, calls } = fakeContext();
  drawBubble(context, { ...createBubble("thought", 100, 100), text: "", tailTipX: 60, tailTipY: 220 });

  assert.equal(calls.filter((call) => call.name === "fill").length, 4);
  assert.equal(calls.filter((call) => call.name === "arc").length, 3);
});

test("whisper preset activates a readable dashed outline", () => {
  const { context, calls } = fakeContext();
  drawBubble(context, { ...createBubble("whisper", 100, 100), text: "" });

  const dash = calls.find((call) => call.name === "setLineDash");
  assert.ok(dash);
  assert.deepEqual(dash.args, [8, 5]);
});

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

  const curves = calls.filter((call) => call.name === "bezierCurveTo");
  assert.ok(curves.length >= 10);
  const controlXs = curves.flatMap((call) => [call.args[0], call.args[2], call.args[4]]);
  const controlYs = curves.flatMap((call) => [call.args[1], call.args[3], call.args[5]]);
  assert.ok(Math.min(...controlXs) <= 5 && Math.max(...controlXs) >= 195);
  assert.ok(Math.min(...controlYs) <= 42 && Math.max(...controlYs) >= 158);
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
