const ORIGINAL_RING_COLORS = Object.freeze({
  background: "#FFFFFF",
  hoursBackground: "#F4FFEE",
  minutesBackground: "#E7FDDB",
  secondsBackground: "#FFFFFF",
  numbers: "#000000",
  centerMarker: "#FF9CDE",
});

const COLORS = {
  ink: 0,
  marker: "#000000",
  ...ORIGINAL_RING_COLORS,
};

const FONT_FAMILY = '"SN Pro", Arial, sans-serif';
const CENTER_MARKER_SIZE = 10;
const CENTER_MARKER_FRAME_SIZE = 50;
const CENTER_MARKER_EASING = 0.16;
const MINUTES_BACKGROUND_EXPANSION = 0.78;
const SECONDS_LAYER_BLUR_AMOUNT = 0.3;
const RING_PARALLAX_EASING = 0.08;
const RING_PARALLAX_DISTANCE = {
  hours: 7,
  minutes: 4,
  seconds: 2,
};

const WEIGHTS = {
  light: 200,
  active: 800,
};

const ACTIVE_SIZE_SCALE = 1.1;

const RING_STYLE = {
  hours: {
    values: Array.from({ length: 24 }, (_, index) => index + 1),
    size: 0.058,
    smallestSize: 0.018,
  },
  minutes: {
    values: Array.from({ length: 60 }, (_, index) => index + 1),
    smallestSize: 0.016,
  },
  seconds: {
    values: Array.from({ length: 60 }, (_, index) => index + 1),
    smallestSize: 0.014,
  },
};

let clockHost;
let clockReadout;
let canvasSize = 0;
let secondsBackgroundLayer;
let centerMarkerOffset = { x: 0, y: 0 };
let localPointer;
let externalPointer;
let ringParallaxOffset = {
  hours: { x: 0, y: 0 },
  minutes: { x: 0, y: 0 },
  seconds: { x: 0, y: 0 },
};

function setup() {
  clockHost = document.getElementById("clock-canvas");
  clockReadout = document.getElementById("clock-readout");

  const canvas = createCanvas(1, 1);
  canvas.parent(clockHost);
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  noStroke();
  textAlign(CENTER, CENTER);
  frameRate(60);

  resizeClock();
  setupLocalPointerTracking(canvas.elt);
  setupParentPointerBridge();
  setupColorDevice();
  loadSNPro();
}

function draw() {
  const now = new Date();
  const time = getClockTime(now);

  background(COLORS.background);

  const center = { x: width / 2, y: height / 2 };
  const ringRadii = getAdaptiveRingRadii();
  const backgroundBlend = getBackgroundBlend(center, ringRadii);
  const minutesOuterRadius = getMinutesBackgroundOuterRadius(
    ringRadii,
    backgroundBlend,
  );
  const ringCenters = getRingParallaxCenters(center, ringRadii);

  drawMinutesRingBackground(
    ringCenters.minutes,
    ringRadii,
    minutesOuterRadius,
  );
  drawHoursRingBackground(ringCenters.hours, ringRadii);
  drawBackgroundGradient(
    ringCenters.minutes,
    ringRadii,
    backgroundBlend,
    minutesOuterRadius,
  );
  drawSecondsRingBackground(
    ringCenters.seconds,
    ringRadii,
    minutesOuterRadius,
    backgroundBlend,
  );
  drawCenterMarker(center, ringRadii);
  drawHoursRing(ringCenters.hours, time, ringRadii.hours);
  drawMinutesRing(ringCenters.minutes, time, ringRadii.minutes);
  drawSecondsRing(ringCenters.seconds, time, ringRadii.seconds);

  updateReadout(time);
}

function setupColorDevice() {
  const colorDevice = document.querySelector(".color-device");
  const inputs = document.querySelectorAll("[data-ring-color]");
  const resetButton = document.getElementById("color-reset");

  const toggleColorDevice = () => {
    if (!colorDevice) return;

    const isHidden = colorDevice.classList.toggle("color-device--hidden");
    colorDevice.setAttribute("aria-hidden", String(isHidden));
  };

  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || event.repeat) return;

    event.preventDefault();
    toggleColorDevice();
  });

  for (const input of inputs) {
    const colorKey = input.dataset.ringColor;
    if (!(colorKey in COLORS)) continue;

    input.value = COLORS[colorKey];
    if (colorKey === "background") {
      applyPageBackground(COLORS.background);
    }
    input.addEventListener("input", () => {
      COLORS[colorKey] = input.value;
      if (colorKey === "background") {
        applyPageBackground(COLORS.background);
      }
    });
  }

  resetButton?.addEventListener("click", () => {
    for (const [colorKey, originalColor] of Object.entries(
      ORIGINAL_RING_COLORS,
    )) {
      COLORS[colorKey] = originalColor;
      if (colorKey === "background") {
        applyPageBackground(COLORS.background);
      }

      const input = document.querySelector(
        `[data-ring-color="${colorKey}"]`,
      );
      if (input) input.value = originalColor;
    }
  });
}

function applyPageBackground(color) {
  document.documentElement.style.setProperty("--page-background", color);
}

function setupLocalPointerTracking(canvasElement) {
  const updatePointer = (clientX, clientY) => {
    const canvasRect = canvasElement.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return;

    externalPointer = undefined;
    localPointer = {
      x: ((clientX - canvasRect.left) / canvasRect.width) * width,
      y: ((clientY - canvasRect.top) / canvasRect.height) * height,
    };
  };

  const handlePointer = (event) => {
    updatePointer(event.clientX, event.clientY);
  };

  const handleTouch = (event) => {
    const touch = event.touches[0] || event.changedTouches[0];
    if (touch) updatePointer(touch.clientX, touch.clientY);
  };

  canvasElement.addEventListener("pointerdown", handlePointer, {
    passive: true,
  });
  canvasElement.addEventListener("pointermove", handlePointer, {
    passive: true,
  });
  canvasElement.addEventListener("pointerenter", handlePointer, {
    passive: true,
  });
  canvasElement.addEventListener("touchstart", handleTouch, {
    passive: true,
  });
  canvasElement.addEventListener("touchmove", handleTouch, {
    passive: true,
  });
}

function setupParentPointerBridge() {
  if (window.parent === window) return;

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;

    const data = event.data;
    if (!data || data.type !== "weight-clock:pointermove") return;

    if (data.active === false) {
      externalPointer = undefined;
      return;
    }

    const x = Number(data.x);
    const y = Number(data.y);
    const viewportWidth = Number(data.viewportWidth);
    const viewportHeight = Number(data.viewportHeight);
    const canvas = clockHost?.querySelector("canvas");

    if (
      !canvas ||
      ![x, y, viewportWidth, viewportHeight].every(Number.isFinite) ||
      viewportWidth <= 0 ||
      viewportHeight <= 0
    ) {
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const viewportX = (x / viewportWidth) * window.innerWidth;
    const viewportY = (y / viewportHeight) * window.innerHeight;

    externalPointer = {
      x: ((viewportX - canvasRect.left) / canvasRect.width) * width,
      y: ((viewportY - canvasRect.top) / canvasRect.height) * height,
    };
  });
}

function getInteractionPointer() {
  return externalPointer || localPointer || { x: mouseX, y: mouseY };
}

function getClockTime(now) {
  const hours24 = now.getHours();
  const minute = now.getMinutes();
  const second = now.getSeconds();
  const millisecondProgress = now.getMilliseconds() / 1000;

  return {
    hours: hours24 === 0 ? 24 : hours24,
    minute,
    second,
    secondProgress: millisecondProgress,
    hourTransitionProgress:
      minute === 0 && second === 0 ? millisecondProgress : 1,
  };
}

function getAdaptiveRingRadii() {
  const largestTextSize =
    responsiveFontSize(RING_STYLE.hours.size, 24, 48) *
    ACTIVE_SIZE_SCALE;
  const largestTextBox = measureVariableTextBox(
    "60",
    largestTextSize,
    WEIGHTS.active,
  );
  const halfDiagonal = Math.hypot(
    largestTextBox.width / 2,
    largestTextBox.height / 2,
  );
  const interRingGap = 0;
  const ringTightness = 0.94;
  const ringSeparation = halfDiagonal * 2 * ringTightness + interRingGap;
  const minuteFocusReserve = 0;
  const outerLimit = canvasSize * 0.46 - halfDiagonal;
  const availableBaseRadius =
    outerLimit - ringSeparation * 2 - minuteFocusReserve;
  const baseRadius = Math.max(
    largestTextSize * 1.2,
    Math.min(canvasSize * 0.14, availableBaseRadius),
  );

  return {
    hours: baseRadius,
    minutes: baseRadius + ringSeparation + minuteFocusReserve,
    seconds: baseRadius + ringSeparation * 2 + minuteFocusReserve,
  };
}

function drawHoursRingBackground(center, ringRadii) {
  const ringSpacing = Math.max(0, ringRadii.minutes - ringRadii.hours);
  const bandHalfWidth = ringSpacing * 0.5;
  const outerRadius = ringRadii.hours + bandHalfWidth;

  drawRingBackground(
    center,
    0,
    outerRadius,
    COLORS.hoursBackground,
  );
}

function drawMinutesRingBackground(center, ringRadii, outerRadius) {
  const innerSpacing = Math.max(0, ringRadii.minutes - ringRadii.hours);
  const innerRadius = Math.max(0, ringRadii.minutes - innerSpacing * 0.5);

  drawRingBackground(
    center,
    innerRadius,
    outerRadius,
    COLORS.minutesBackground,
  );
}

function drawSecondsRingBackground(
  center,
  ringRadii,
  innerRadius,
  blend,
) {
  const outerRadius = getSecondsBackgroundOuterRadius(ringRadii);
  const ringSpacing = Math.max(0, ringRadii.seconds - ringRadii.minutes);
  const blurRadius = ringSpacing * SECONDS_LAYER_BLUR_AMOUNT * blend;
  const layer = getSecondsBackgroundLayer();
  const layerContext = layer.getContext("2d");

  layerContext.clearRect(0, 0, layer.width, layer.height);
  layerContext.fillStyle = COLORS.secondsBackground;
  layerContext.beginPath();
  layerContext.arc(center.x, center.y, outerRadius, 0, TWO_PI);
  layerContext.arc(center.x, center.y, innerRadius, 0, TWO_PI, true);
  layerContext.fill("evenodd");

  const context = drawingContext;
  context.save();
  context.filter = blurRadius > 0 ? `blur(${blurRadius}px)` : "none";
  context.drawImage(layer, 0, 0, width, height);
  context.restore();
}

function drawRingBackground(center, innerRadius, outerRadius, color) {
  noStroke();
  fill(color);
  ellipse(center.x, center.y, outerRadius * 2, outerRadius * 2);

  fill(COLORS.background);
  ellipse(center.x, center.y, innerRadius * 2, innerRadius * 2);
}

function getSecondsBackgroundLayer() {
  if (!secondsBackgroundLayer) {
    secondsBackgroundLayer = document.createElement("canvas");
  }

  if (
    secondsBackgroundLayer.width !== width ||
    secondsBackgroundLayer.height !== height
  ) {
    secondsBackgroundLayer.width = width;
    secondsBackgroundLayer.height = height;
  }

  return secondsBackgroundLayer;
}

function drawCenterMarker(center, ringRadii) {
  const pointer = getInteractionPointer();
  const deltaX = pointer.x - center.x;
  const deltaY = pointer.y - center.y;
  const mouseDistance = Math.hypot(deltaX, deltaY);
  const interactionRadius = getSecondsBackgroundOuterRadius(ringRadii);
  const pursuit = smoothStep(
    constrain(mouseDistance / interactionRadius, 0, 1),
  );
  const maximumOffset =
    (CENTER_MARKER_FRAME_SIZE - CENTER_MARKER_SIZE) * 0.5;
  const offsetScale =
    mouseDistance > 0 ? (maximumOffset * pursuit) / mouseDistance : 0;
  const targetOffsetX = deltaX * offsetScale;
  const targetOffsetY = deltaY * offsetScale;

  centerMarkerOffset.x = lerp(
    centerMarkerOffset.x,
    targetOffsetX,
    CENTER_MARKER_EASING,
  );
  centerMarkerOffset.y = lerp(
    centerMarkerOffset.y,
    targetOffsetY,
    CENTER_MARKER_EASING,
  );

  noStroke();
  fill(COLORS.centerMarker);
  ellipse(
    center.x + centerMarkerOffset.x,
    center.y + centerMarkerOffset.y,
    CENTER_MARKER_SIZE,
    CENTER_MARKER_SIZE,
  );
}

function getRingParallaxCenters(center, ringRadii) {
  const pointer = getInteractionPointer();
  const deltaX = pointer.x - center.x;
  const deltaY = pointer.y - center.y;
  const mouseDistance = Math.hypot(deltaX, deltaY);
  const interactionRadius = getSecondsBackgroundOuterRadius(ringRadii);
  const parallaxAmount = smoothStep(
    constrain(mouseDistance / interactionRadius, 0, 1),
  );
  const directionX = mouseDistance > 0 ? deltaX / mouseDistance : 0;
  const directionY = mouseDistance > 0 ? deltaY / mouseDistance : 0;
  const centers = {};

  for (const ringName of Object.keys(RING_PARALLAX_DISTANCE)) {
    const distance = RING_PARALLAX_DISTANCE[ringName];
    const targetX = directionX * distance * parallaxAmount;
    const targetY = directionY * distance * parallaxAmount;
    const offset = ringParallaxOffset[ringName];

    offset.x = lerp(offset.x, targetX, RING_PARALLAX_EASING);
    offset.y = lerp(offset.y, targetY, RING_PARALLAX_EASING);
    centers[ringName] = {
      x: center.x + offset.x,
      y: center.y + offset.y,
    };
  }

  return centers;
}

function getBackgroundBlend(center, ringRadii) {
  const outerRadius = getSecondsBackgroundOuterRadius(ringRadii);
  const pointer = getInteractionPointer();
  const mouseDistance = Math.hypot(
    pointer.x - center.x,
    pointer.y - center.y,
  );
  const proximity = 1 - constrain(mouseDistance / outerRadius, 0, 1);

  return 1 - smoothStep(proximity);
}

function drawBackgroundGradient(
  center,
  ringRadii,
  opacity,
  minutesOuterRadius,
) {
  if (opacity <= 0) return;

  const outerRadius = getSecondsBackgroundOuterRadius(ringRadii);
  const hoursBoundary =
    ringRadii.hours + (ringRadii.minutes - ringRadii.hours) * 0.5;
  const minutesBoundary = minutesOuterRadius;
  const gradient = drawingContext.createRadialGradient(
    center.x,
    center.y,
    0,
    center.x,
    center.y,
    outerRadius,
  );

  gradient.addColorStop(0, COLORS.hoursBackground);
  gradient.addColorStop(
    constrain(hoursBoundary / outerRadius, 0, 1),
    COLORS.minutesBackground,
  );
  gradient.addColorStop(
    constrain(minutesBoundary / outerRadius, 0, 1),
    COLORS.secondsBackground,
  );
  gradient.addColorStop(1, COLORS.secondsBackground);

  const context = drawingContext;
  context.save();
  context.globalAlpha = opacity;
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(center.x, center.y, outerRadius, 0, TWO_PI);
  context.fill();
  context.restore();
}

function getSecondsBackgroundOuterRadius(ringRadii) {
  const ringSpacing = Math.max(0, ringRadii.seconds - ringRadii.minutes);
  return ringRadii.seconds + ringSpacing * 0.5;
}

function getMinutesBackgroundOuterRadius(ringRadii, blend) {
  const normalOuterRadius =
    ringRadii.minutes + (ringRadii.seconds - ringRadii.minutes) * 0.5;
  const secondsOuterRadius = getSecondsBackgroundOuterRadius(ringRadii);
  const expansion = blend * MINUTES_BACKGROUND_EXPANSION;

  return lerp(normalOuterRadius, secondsOuterRadius, expansion);
}

function drawHoursRing(center, time, radius) {
  const currentIndex = valueToIndex(time.hours, RING_STYLE.hours.values);
  const previousIndex = valueToIndex(
    previousValue(time.hours, RING_STYLE.hours.values),
    RING_STYLE.hours.values,
  );
  const transition = smoothStep(time.hourTransitionProgress);
  const smallestSize = responsiveFontSize(
    RING_STYLE.hours.smallestSize,
    16,
    24,
  );
  const largestSize = responsiveFontSize(RING_STYLE.hours.size, 24, 48);
  const focusPosition =
    time.hourTransitionProgress < 1
      ? previousIndex + smoothStep(time.hourTransitionProgress)
      : currentIndex;

  drawRing({
    center,
    values: RING_STYLE.hours.values,
    radius,
    fontSizeForIndex: (index) =>
      ringFocusFontSizeForIndex(
        index,
        focusPosition,
        smallestSize,
        largestSize,
        RING_STYLE.hours.values.length,
      ),
    opacityForIndex: (index) =>
      ringFocusOpacityForIndex(
        index,
        focusPosition,
        RING_STYLE.hours.values.length,
      ),
    weightForIndex: (index) =>
      ringFocusWeightForIndex(
        index,
        focusPosition,
        RING_STYLE.hours.values.length,
      ),
    colorForIndex: () => COLORS.numbers,
    currentIndex,
    previousIndex,
    currentWeight: lerp(WEIGHTS.light, WEIGHTS.active, transition),
    previousWeight: lerp(WEIGHTS.active, WEIGHTS.light, transition),
  });
}

function drawMinutesRing(center, time, radius) {
  const minuteLabels = RING_STYLE.minutes.values.map((value) =>
    value === 60 ? "00" : value,
  );
  const displayMinute = time.minute === 0 ? 60 : time.minute;
  const previousMinute = previousValue(displayMinute, RING_STYLE.minutes.values);
  const currentIndex = valueToIndex(displayMinute, RING_STYLE.minutes.values);
  const previousIndex = valueToIndex(previousMinute, RING_STYLE.minutes.values);
  const transition = smoothStep(time.second === 0 ? time.secondProgress : 1);
  const smallestSize = breathingFontSize(
    RING_STYLE.minutes.smallestSize,
    8,
    13,
    radius,
    RING_STYLE.minutes.values.length,
    0.82,
  );
  const largestSize = responsiveFontSize(RING_STYLE.hours.size, 24, 48);
  const focusPosition =
    time.second === 0
      ? previousIndex + smoothStep(time.secondProgress)
      : currentIndex;

  drawRing({
    center,
    values: minuteLabels,
    radius,
    focusGapMultiplier: 0.12,
    fontSizeForIndex: (index) =>
      ringFocusFontSizeForIndex(
        index,
        focusPosition,
        smallestSize,
        largestSize,
        RING_STYLE.minutes.values.length,
      ),
    opacityForIndex: (index) =>
      ringFocusOpacityForIndex(
        index,
        focusPosition,
        RING_STYLE.minutes.values.length,
        1.35,
      ),
    weightForIndex: (index) =>
      ringFocusWeightForIndex(
        index,
        focusPosition,
        RING_STYLE.minutes.values.length,
      ),
    colorForIndex: () => COLORS.numbers,
    currentIndex,
    previousIndex,
    currentWeight: lerp(WEIGHTS.light, WEIGHTS.active, transition),
    previousWeight: lerp(WEIGHTS.active, WEIGHTS.light, transition),
  });
}

function drawSecondsRing(center, time, radius) {
  const secondLabels = RING_STYLE.seconds.values.map((value) =>
    value === 60 ? "00" : value,
  );
  const displaySecond = time.second === 0 ? 60 : time.second;
  const currentIndex = valueToIndex(displaySecond, RING_STYLE.seconds.values);
  const previousIndex = valueToIndex(
    previousValue(displaySecond, RING_STYLE.seconds.values),
    RING_STYLE.seconds.values,
  );
  const transition = smoothStep(time.secondProgress);
  const smallestSize = breathingFontSize(
    RING_STYLE.seconds.smallestSize,
    8,
    12,
    radius,
    RING_STYLE.seconds.values.length,
    0.82,
  );
  const largestSize = responsiveFontSize(RING_STYLE.hours.size, 24, 48);
  const focusPosition = previousIndex + smoothStep(time.secondProgress);

  drawRing({
    center,
    values: secondLabels,
    radius,
    focusGapMultiplier: 0.12,
    compactFocusSpacing: 0.5,
    fontSizeForIndex: (index) =>
      ringFocusFontSizeForIndex(
        index,
        focusPosition,
        smallestSize,
        largestSize,
        RING_STYLE.seconds.values.length,
      ),
    opacityForIndex: (index) =>
      ringFocusOpacityForIndex(
        index,
        focusPosition,
        RING_STYLE.seconds.values.length,
        1.35,
      ),
    weightForIndex: (index) =>
      ringFocusWeightForIndex(
        index,
        focusPosition,
        RING_STYLE.seconds.values.length,
      ),
    colorForIndex: () => COLORS.numbers,
    currentIndex,
    previousIndex,
    currentWeight: lerp(WEIGHTS.light, WEIGHTS.active, transition),
    previousWeight: lerp(WEIGHTS.active, WEIGHTS.light, transition),
  });
}

function drawRing({
  center,
  values,
  radius,
  fontSize,
  fontSizeForIndex,
  opacityForIndex,
  weightForIndex,
  colorForIndex,
  focusGapMultiplier = 0.28,
  compactFocusSpacing = 0,
  currentIndex,
  previousIndex,
  currentWeight,
  previousWeight,
}) {
  const count = values.length;
  const weights = values.map((_, index) =>
    weightForIndex
      ? weightForIndex(index)
      : getWeightForIndex(
          index,
          currentIndex,
          previousIndex,
          currentWeight,
          previousWeight,
        ),
  );
  const fontSizes = values.map((_, index) =>
    fontSizeForIndex ? fontSizeForIndex(index) : fontSize,
  );
  const opacities = values.map((_, index) =>
    opacityForIndex ? opacityForIndex(index) : 1,
  );
  const colors = values.map((_, index) =>
    colorForIndex ? colorForIndex(index) : COLORS.numbers,
  );
  const ringLayout = getAdaptiveRingAngles(
    values,
    radius,
    fontSizes,
    weights,
    focusGapMultiplier,
    compactFocusSpacing,
  );
  const renderedFontSizes = fontSizes.map(
    (size) => size * ringLayout.fontScale,
  );

  for (let index = 0; index < count; index += 1) {
    const label = values[index];
    const angle = ringLayout.angles[index];
    const x = center.x + Math.cos(angle) * radius;
    const y = center.y + Math.sin(angle) * radius;

    drawVariableText(
      String(label),
      x,
      y,
      renderedFontSizes[index],
      weights[index],
      opacities[index],
      colors[index],
    );
  }
}

function getWeightForIndex(
  index,
  currentIndex,
  previousIndex,
  currentWeight,
  previousWeight,
) {
  if (index === currentIndex) return currentWeight;
  if (index === previousIndex && previousIndex !== currentIndex) {
    return previousWeight;
  }
  return WEIGHTS.light;
}

function getAdaptiveRingAngles(
  values,
  radius,
  fontSizes,
  weights,
  focusGapMultiplier,
  compactFocusSpacing,
) {
  const count = values.length;
  const textBoxes = values.map((value, index) =>
    measureVariableTextBox(String(value), fontSizes[index], weights[index]),
  );
  const circumference = TWO_PI * radius;
  let tangentialGap = constrain(canvasSize * 0.009, 3, 8);
  const minimumTangentialGap = constrain(canvasSize * 0.004, 2, 4);
  const smallestFontSize = Math.min(...fontSizes);
  const largestFontSize = Math.max(...fontSizes);
  const fontSizeRange = largestFontSize - smallestFontSize;
  const focusStrengths = fontSizes.map((fontSize) =>
    fontSizeRange > 0
      ? constrain((fontSize - smallestFontSize) / fontSizeRange, 0, 1)
      : 0,
  );
  let fontScale = 1;
  let angles = values.map(
    (_, index) => ((index + 1) % count) * (TWO_PI / count) - HALF_PI,
  );
  const anchorIndex = count - 1;

  for (let iteration = 0; iteration < 10; iteration += 1) {
    const halfExtents = textBoxes.map((box, index) =>
      projectedTangentialHalfExtent(box, angles[index], fontScale),
    );
    const requiredSteps = halfExtents.map((extent, index) => {
      const nextIndex = (index + 1) % count;
      const pairHeight = Math.max(
        textBoxes[index].height,
        textBoxes[nextIndex].height,
      );
      const pairFocus = Math.max(
        focusStrengths[index],
        focusStrengths[nextIndex],
      );
      const focusGap =
        pairHeight * fontScale * focusGapMultiplier * pairFocus;
      return extent + halfExtents[nextIndex] + tangentialGap + focusGap;
    });
    const requiredCircumference = requiredSteps.reduce(
      (total, step) => total + step,
      0,
    );

    if (
      requiredCircumference > circumference &&
      tangentialGap > minimumTangentialGap
    ) {
      const overflowPerStep =
        (requiredCircumference - circumference) / count;
      tangentialGap = Math.max(
        minimumTangentialGap,
        tangentialGap - overflowPerStep,
      );
      continue;
    }

    if (requiredCircumference > circumference) {
      const fixedGapCircumference = tangentialGap * count;
      const scalableCircumference =
        requiredCircumference - fixedGapCircumference;
      const availableScalableCircumference =
        circumference - fixedGapCircumference;
      const scaleCorrection =
        availableScalableCircumference > 0 && scalableCircumference > 0
          ? availableScalableCircumference / scalableCircumference
          : circumference / requiredCircumference;
      fontScale *= constrain(scaleCorrection, 0.1, 1);
      continue;
    }

    const extraCircumference = circumference - requiredCircumference;
    const extraWeights = requiredSteps.map((_, index) => {
      const nextIndex = (index + 1) % count;
      const pairFocus = Math.max(
        focusStrengths[index],
        focusStrengths[nextIndex],
      );
      return Math.max(0.1, 1 - pairFocus * compactFocusSpacing);
    });
    const totalExtraWeight = extraWeights.reduce(
      (total, weight) => total + weight,
      0,
    );
    const extraByStep = extraWeights.map(
      (weight) => (extraCircumference * weight) / totalExtraWeight,
    );
    const nextAngles = Array(count).fill(0);
    nextAngles[anchorIndex] = -HALF_PI;

    for (let offset = 1; offset < count; offset += 1) {
      const previousIndex = (anchorIndex + offset - 1) % count;
      const index = (anchorIndex + offset) % count;
      const arcStep =
        requiredSteps[previousIndex] + extraByStep[previousIndex];
      nextAngles[index] = nextAngles[previousIndex] + arcStep / radius;
    }

    angles = nextAngles;
  }

  return { angles, fontScale };
}

function projectedTangentialHalfExtent(box, angle, scale) {
  const tangentX = Math.abs(Math.sin(angle));
  const tangentY = Math.abs(Math.cos(angle));
  return (
    tangentX * box.width * scale * 0.5 +
    tangentY * box.height * scale * 0.5
  );
}

function measureVariableTextBox(label, fontSize, weight) {
  const context = drawingContext;
  context.save();
  setCanvasFont(context, fontSize, weight);
  const metrics = context.measureText(label);
  const height =
    metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent ||
    fontSize;
  context.restore();
  return { width: metrics.width, height };
}

function drawVariableText(
  label,
  x,
  y,
  fontSize,
  weight,
  opacity = 1,
  fillColor = COLORS.numbers,
) {
  const context = drawingContext;
  context.save();
  context.fillStyle = fillColor;
  context.globalAlpha = constrain(opacity, 0, 1);
  setCanvasFont(context, fontSize, weight);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fontKerning = "normal";
  context.fillText(label, x, y);
  context.restore();
}

function valueToIndex(value, values) {
  return values.indexOf(value);
}

function previousValue(value, values) {
  const currentIndex = valueToIndex(value, values);
  return values[(currentIndex - 1 + values.length) % values.length];
}

function ringFocusFontSizeForIndex(
  index,
  focusPosition,
  smallestSize,
  largestSize,
  count,
) {
  const focus = ringFocusAmountForIndex(index, focusPosition, count);
  const baseSize = lerp(smallestSize, largestSize, focus);
  const activeSizeBoost =
    largestSize * (ACTIVE_SIZE_SCALE - 1) * focus;

  return baseSize + activeSizeBoost;
}

function ringFocusOpacityForIndex(
  index,
  focusPosition,
  count,
  falloff = 1,
) {
  const directDistance = Math.abs(index - focusPosition);
  const distance = Math.min(directDistance, count - directDistance);
  const proximity = 1 - constrain(distance / (count / 2), 0, 1);
  const curvedProximity = Math.pow(proximity, falloff);

  return smoothStep(curvedProximity);
}

function ringFocusWeightForIndex(index, focusPosition, count) {
  return lerp(
    WEIGHTS.light,
    WEIGHTS.active,
    ringFocusAmountForIndex(index, focusPosition, count, 2.2),
  );
}

function ringFocusAmountForIndex(
  index,
  focusPosition,
  count,
  spread = 0.85,
) {
  const directDistance = Math.abs(index - focusPosition);
  const distance = Math.min(directDistance, count - directDistance);
  const oppositeDistance = count / 2;
  const rawFocus = Math.pow(0.5, distance / spread);
  const oppositeFocus = Math.pow(0.5, oppositeDistance / spread);

  return constrain(
    (rawFocus - oppositeFocus) / (1 - oppositeFocus),
    0,
    1,
  );
}

function responsiveFontSize(scale, minimum, maximum) {
  return constrain(canvasSize * scale, minimum, maximum);
}

function breathingFontSize(
  scale,
  minimum,
  maximum,
  radius,
  count,
  spacingFactor = 0.82,
) {
  const preferredSize = responsiveFontSize(scale, minimum, maximum);
  const slotSize = (canvasSize * radius * TWO_PI) / count;
  return Math.min(preferredSize, slotSize * spacingFactor);
}

function smoothStep(value) {
  const clamped = constrain(value, 0, 1);
  return (
    clamped *
    clamped *
    clamped *
    (clamped * (clamped * 6 - 15) + 10)
  );
}

function resizeClock() {
  if (!clockHost) return;

  canvasSize = Math.max(1, Math.floor(Math.min(clockHost.clientWidth, clockHost.clientHeight)));
  resizeCanvas(canvasSize, canvasSize);
}

function setCanvasFont(context, fontSize, weight) {
  context.font = `${Math.round(weight)} ${fontSize}px ${FONT_FAMILY}`;
}

function loadSNPro() {
  if (!document.fonts) return;

  Promise.all([
    document.fonts.load('200 16px "SN Pro"'),
    document.fonts.load('800 16px "SN Pro"'),
  ]).catch(() => {});
}

function updateReadout(time) {
  if (!clockReadout || frameCount % 30 !== 0) return;

  const displayMinute = time.minute === 0 ? 60 : time.minute;
  const displaySecond = time.second === 0 ? 60 : time.second;
  clockReadout.textContent = `${String(time.hours).padStart(2, "0")} horas, ${String(displayMinute).padStart(2, "0")} minutos e ${String(displaySecond).padStart(2, "0")} segundos.`;
}

function windowResized() {
  resizeClock();
}
