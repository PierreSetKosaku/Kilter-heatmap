// --- COLOR & QUANTILE LOGIC ---

/**
 * Returns a color based on which percentile bin the value falls into.
 */
function getPercentileColor(value, quantiles) {
  if (value === 0) return "transparent";
  if (value >= quantiles[4]) return "#bd0026"; // top 5%
  if (value >= quantiles[3]) return "#fd8d3c"; // next 15%
  if (value >= quantiles[2]) return "#fecc5c"; // middle 30%
  if (value >= quantiles[1]) return "#ffffb2"; // next 20%
  return "#d4f7b2"; // bottom 30%
}

/**
 * Compute percentile (quantile) cutoffs from an array of usage counts.
 */
function computeQuantiles(values) {
  if (!values.length) return [0, 0, 0, 0, 0];
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (q) => Math.floor(q * sorted.length);
  return [
    sorted[0],
    sorted[idx(0.3)],
    sorted[idx(0.5)],
    sorted[idx(0.85)],
    sorted[idx(0.95)],
  ];
}

// --- DATA STRUCTURE HELPERS ---

/**
 * Merges all angles' hold/grade counts into a single object for global heatmap view.
 */
function mergeAllAngles(gradeCountMap) {
  const merged = {};
  for (const angleData of Object.values(gradeCountMap)) {
    if (!angleData.holds) continue;
    for (const [holdId, grades] of Object.entries(angleData.holds)) {
      if (!merged[holdId]) merged[holdId] = {};
      for (const [grade, count] of Object.entries(grades)) {
        merged[holdId][grade] = (merged[holdId][grade] || 0) + count;
      }
    }
  }
  return merged;
}

/**
 * For future use: merges all boulders from all angles (not used directly in this code, but kept for extensibility).
 */
function mergeAllBoulders(gradeCountMap) {
  const merged = {};
  for (const angleData of Object.values(gradeCountMap)) {
    if (!angleData.boulders) continue;
    for (const uuid of Object.keys(angleData.boulders)) {
      merged[uuid] = true;
    }
  }
  return merged;
}

/**
 * Returns the number of boulders matching a grade and angle.
 */
function countBouldersWithGrade(gradeCountMap, selectedGrade, selectedAngle) {
  let total = 0;
  const angles =
    selectedAngle === "all" ? Object.keys(gradeCountMap) : [selectedAngle];
  for (const angle of angles) {
    const data = gradeCountMap[angle];
    if (!data || !data.boulders) continue;
    for (const boulderId in data.boulders) {
      const boulder = data.boulders[boulderId];
      if (selectedGrade === "all" || boulder.grade === selectedGrade) {
        total++;
      }
    }
  }
  return total;
}

/**
 * Updates the boulder count display in the UI.
 */
function updateBoulderCount(gradeCountMap, selectedAngle, selectedGrade) {
  const count = countBouldersWithGrade(
    gradeCountMap,
    selectedGrade,
    selectedAngle
  );
  document.getElementById("boulder-number").textContent = count;
}

// --- TOOLTIP LOGIC ---

/**
 * Shows the tooltip with given HTML at the mouse position.
 */
function showTooltip(content, event) {
  const tooltip = document.getElementById("tooltip");
  tooltip.innerHTML = content;
  tooltip.style.display = "block";
  tooltip.style.left = `${event.pageX + 10}px`;
  tooltip.style.top = `${event.pageY + 10}px`;
}

/**
 * Hides the tooltip.
 */
function hideTooltip() {
  const tooltip = document.getElementById("tooltip");
  tooltip.style.display = "none";
}

// --- MAIN RENDER FUNCTION ---

/**
 * Draws the Kilterboard SVG heatmap according to all selected filters.
 */
function drawBoardWithNormalizedHeatmap(
  svgElementId,
  imagesToHolds,
  imageWidth,
  imageHeight,
  edgeLeft,
  edgeRight,
  edgeBottom,
  edgeTop,
  gradeCountMap,
  selectedAngle = "all",
  selectedGrade = "all"
) {
  // Prepare SVG
  const svgElement = document.getElementById(svgElementId);
  svgElement.innerHTML = "";
  svgElement.setAttribute("viewBox", `0 0 ${imageWidth} ${imageHeight}`);

  // Draw the background image(s)
  Object.keys(imagesToHolds).forEach((imageUrl) => {
    const imageElement = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "image"
    );
    imageElement.setAttributeNS(
      "http://www.w3.org/1999/xlink",
      "xlink:href",
      imageUrl
    );
    imageElement.setAttribute("width", imageWidth);
    imageElement.setAttribute("height", imageHeight);
    svgElement.appendChild(imageElement);
  });

  // Set up grid/spacing
  const xSpacing = imageWidth / (edgeRight - edgeLeft);
  const ySpacing = imageHeight / (edgeTop - edgeBottom);
  const allHolds = Object.values(imagesToHolds).flat();

  // Use only the selected angle or merge all
  const activeMap =
    selectedAngle === "all"
      ? mergeAllAngles(gradeCountMap)
      : gradeCountMap[selectedAngle]?.holds || {};

  // Usage counts for current filter
  const usagePerHold = {};
  for (const [holdId, gradeCounts] of Object.entries(activeMap)) {
    const filteredGrades =
      selectedGrade === "all"
        ? Object.values(gradeCounts)
        : [gradeCounts[selectedGrade] || 0];
    usagePerHold[holdId] = filteredGrades.reduce((a, b) => a + b, 0);
  }

  // Compute percentile bins
  const usageVals = Object.values(usagePerHold)
    .filter((u) => u > 0)
    .sort((a, b) => a - b);
  const quantiles = computeQuantiles(usageVals);

  // Draw circles for holds
  for (const [holdId, _mirroredHoldId, x, y] of allHolds) {
    // Ignore out-of-bounds or unwanted margins
    if (x < edgeLeft || x > edgeRight || y < edgeBottom || y > edgeTop)
      continue;
    const xPixel = (x - edgeLeft) * xSpacing;
    const yPixel = imageHeight - (y - edgeBottom) * ySpacing;
    if (xPixel <= 0 || xPixel >= imageWidth || [30, 90, 150].includes(yPixel))
      continue;

    const usage = usagePerHold[holdId] || 0;
    const fillColor = getPercentileColor(usage, quantiles);

    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    circle.setAttribute("id", `hold-${holdId}`);
    circle.setAttribute("cx", xPixel);
    circle.setAttribute("cy", yPixel);
    circle.setAttribute("r", xSpacing * 1.5);
    circle.setAttribute("fill", fillColor);
    circle.setAttribute("fill-opacity", usage > 1 ? 0.7 : 0);
    circle.setAttribute("stroke", usage > 1 ? "black" : "transparent");
    circle.setAttribute("stroke-opacity", usage > 1 ? 0.5 : 0);
    circle.setAttribute("stroke-width", 2);

    // --- Tooltip handlers
    circle.addEventListener("mouseenter", (e) => {
      const grades = activeMap?.[holdId];
      if (!grades) return;
      let html;
      if (selectedGrade === "all") {
        // Show all grades, sorted by usage
        html = Object.entries(grades)
          .sort((a, b) => b[1] - a[1])
          .map(([grade, count]) => `${grade}: ${count}`)
          .join("<br>");
      } else {
        const count = grades[selectedGrade] || 0;
        html = `${selectedGrade}: ${count}`;
      }
      showTooltip(html, e);
    });

    circle.addEventListener("mousemove", (e) => {
      // Keeps tooltip following mouse if already shown
      const tooltip = document.getElementById("tooltip");
      if (tooltip.style.display === "block") {
        tooltip.style.left = `${e.pageX + 10}px`;
        tooltip.style.top = `${e.pageY + 10}px`;
      }
    });

    circle.addEventListener("mouseleave", hideTooltip);

    svgElement.appendChild(circle);
  }
}

// --- MAIN INIT / EVENT LOOP ---

Promise.all([
  fetch("full-hold-map.json").then((res) => res.json()),
  fetch("angle-hold-boulder-grade-map.json").then((res) => res.json()),
]).then(([imagesToHolds, gradeCountMap]) => {
  const angleSelect = document.getElementById("angle-filter");
  const gradeSelect = document.getElementById("grade-filter");

  function redraw() {
    hideTooltip();
    drawBoardWithNormalizedHeatmap(
      "svg-climb",
      imagesToHolds,
      1080,
      1350,
      0,
      144,
      0,
      180,
      gradeCountMap,
      angleSelect.value,
      gradeSelect.value
    );
    updateBoulderCount(gradeCountMap, angleSelect.value, gradeSelect.value);
  }

  // Initial render
  redraw();

  // Attach event listeners
  angleSelect.addEventListener("change", redraw);
  gradeSelect.addEventListener("change", redraw);
});
