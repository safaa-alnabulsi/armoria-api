const HTMLParser = require("node-html-parser");
const {shieldPositions, shieldSize, shieldBox} = require("./dataModel");
const {shieldPaths, blacklight} = require("./templates");

async function draw(id, coa, size, colors) {
  const {division, ordinaries = [], charges = [], shield} = coa;
  logCOAdetails(coa, shield, division, ordinaries, charges);

  const ordinariesRegular = ordinaries.filter(o => !o.above);
  const ordinariesAboveCharges = ordinaries.filter(o => o.above);
  const shieldPath = shieldPaths[shield];
  const tDiv = division ? (division.t.includes("-") ? division.t.split("-")[1] : division.t) : null;
  const positions = shieldPositions[shield];
  const sizeModifier = shieldSize[shield] || 1;
  const viewBox = shieldBox[shield] || "0 0 200 200";

  const loadedCharges = await getCharges(coa, id, shieldPath);
  const loadedPatterns = getPatterns(coa, id);
  const shieldClip = `<clipPath id="${shield}_${id}"><path d="${shieldPath}"/></clipPath>`;
  const divisionClip = division ? `<clipPath id="divisionClip_${id}">${getTemplate(division.division, division.line)}</clipPath>` : "";
  const field = `<rect x="0" y="0" width="200" height="200" fill="${clr(coa.t1)}"/>`;

  const divisionGroup = division ? templateDivision() : "";
  const overlay = `<path d="${shieldPath}" fill="url(#backlight)" stroke="#333"/>`;

  return `<svg id="${id}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">
      <defs>${shieldClip}${divisionClip}${loadedCharges}${loadedPatterns}${blacklight}</defs>
      <g clip-path="url(#${shield}_${id})">${field}${divisionGroup}${templateAboveAll()}</g>
      ${overlay}</svg>`;

  function templateDivision() {
    let svg = "";

    // In field part
    for (const ordinary of ordinariesRegular) {
      if (ordinary.divided === "field") svg += templateOrdinary(ordinary, ordinary.t);
      else if (ordinary.divided === "counter") svg += templateOrdinary(ordinary, tDiv);
    }

    for (const charge of charges) {
      if (charge.divided === "field") svg += templateCharge(charge, charge.t);
      else if (charge.divided === "counter") svg += templateCharge(charge, tDiv);
    }

    for (const ordinary of ordinariesAboveCharges) {
      if (ordinary.divided === "field") svg += templateOrdinary(ordinary, ordinary.t);
      else if (ordinary.divided === "counter") svg += templateOrdinary(ordinary, tDiv);
    }

    // In division part
    svg += `<g clip-path="url(#divisionClip_${id})"><rect x="0" y="0" width="200" height="200" fill="${clr(division.t)}"/>`;

    for (const ordinary of ordinariesRegular) {
      if (ordinary.divided === "division") svg += templateOrdinary(ordinary, ordinary.t);
      else if (ordinary.divided === "counter") svg += templateOrdinary(ordinary, coa.t1);
    }

    for (const charge of charges) {
      if (charge.divided === "division") svg += templateCharge(charge, charge.t);
      else if (charge.divided === "counter") svg += templateCharge(charge, coa.t1);
    }

    for (const ordinary of ordinariesAboveCharges) {
      if (ordinary.divided === "division") svg += templateOrdinary(ordinary, ordinary.t);
      else if (ordinary.divided === "counter") svg += templateOrdinary(ordinary, coa.t1);
    }

    return (svg += `</g>`);
  }

  function templateAboveAll() {
    let svg = "";

    ordinariesRegular.filter(o => !o.divided)
      .forEach(ordinary => {
        svg += templateOrdinary(ordinary, ordinary.t);
      });

    charges.filter(o => !o.divided || !division)
      .forEach(charge => {
        svg += templateCharge(charge, charge.t);
      });

    ordinariesAboveCharges.filter(o => !o.divided)
      .forEach(ordinary => {
        svg += templateOrdinary(ordinary, ordinary.t);
      });

    return svg;
  }

  function templateOrdinary(ordinary, tincture) {
    const fill = clr(tincture);
    let svg = `<g fill="${fill}" stroke="none">`;
    if (ordinary.ordinary === "bordure") svg += `<path d="${shieldPath}" fill="none" stroke="${fill}" stroke-width="16.7%"/>`;
    else if (ordinary.ordinary === "orle") svg += `<path d="${shieldPath}" fill="none" stroke="${fill}" stroke-width="5%" transform="scale(.85)" transform-origin="center"/>`;
    else svg += getTemplate(ordinary.ordinary, ordinary.line);
    return svg + `</g>`;
  }

  function templateCharge(charge, tincture) {
    const fill = clr(tincture);
    const chargePositions = [...new Set(charge.p)].filter(position => positions[position]);

    let svg = "";
    svg += `<g fill="${fill}" stroke="#000">`;
    for (const p of chargePositions) {
      const transform = getElTransform(charge, p);
      svg += `<use href="#${charge.charge}_${id}" transform="${transform}"></use>`;
    }
    return svg + `</g>`;

    function getElTransform(c, p) {
      const s = (c.size || 1) * sizeModifier;
      const sx = c.sinister ? -s : s;
      const sy = c.reversed ? -s : s;
      let [x, y] = positions[p];
      x = x - 100 * (sx - 1);
      y = y - 100 * (sy - 1);
      const scale = c.sinister || c.reversed ? `${sx} ${sy}` : s;
      return `translate(${x} ${y}) scale(${scale})`;
    }
  }

  function getPatterns(coa, id) {
    const isPattern = string => string.includes("-");
    let patternsToAdd = [];
    if (coa.t1.includes("-")) patternsToAdd.push(coa.t1); // add field pattern
    if (coa.division && isPattern(coa.division.t)) patternsToAdd.push(coa.division.t); // add division pattern
    if (coa.ordinaries) coa.ordinaries.filter(ordinary => isPattern(ordinary.t)).forEach(ordinary => patternsToAdd.push(ordinary.t)); // add ordinaries pattern
    if (coa.charges) coa.charges.filter(charge => isPattern(charge.t)).forEach(charge => patternsToAdd.push(charge.t)); // add charges pattern
  
    if (!patternsToAdd.length) return "";
    const {patterns} = require("./templates");
  
    return [...new Set(patternsToAdd)].map(patternString => {
      const [pattern, t1, t2, size] = patternString.split("-");
      const charge = semy(patternString);
      if (charge) return patterns.semy(patternString, clr(t1), clr(t2), getSizeMod(size), charge + "_" + id);
      return patterns[pattern](patternString, clr(t1), clr(t2), getSizeMod(size), charge);
    }).join("");
  }

  // get color or link to pattern
  function clr(tincture) {
    if (colors[tincture]) return colors[tincture];
    if (tincture[0] === "#") return tincture;
    return `url(#${tincture})`;
  }
}

async function getCharges(coa, id, shieldPath) {
  let charges = coa.charges ? coa.charges.map(charge => charge.charge) : []; // add charges
  if (semy(coa.t1)) charges.push(semy(coa.t1)); // add field semy charge
  if (semy(coa.division?.t)) charges.push(semy(coa.division.t)); // add division semy charge

  const uniqueCharges = [...new Set(charges)];
  const fetchedCharges = await Promise.all(
    uniqueCharges.map(async charge => {
      if (charge === "inescutcheon") return `<g id="inescutcheon_${id}"><path transform="translate(66 66) scale(.34)" d="${shieldPath}"/></g>`;
      const fetched = await fetchCharge(charge, id);
      return fetched || "";
    })
  );
  return fetchedCharges.join("");
}

async function fetchCharge(charge, id) {
  const fetch = require("node-fetch");
  const fetched = await fetch("http://localhost:3000/charges/" + charge + ".svg")
    .then(res => {
      if (res.ok) return res.text();
      else throw new Error("Cannot fetch charge");
    }).then(text => {
      const root = HTMLParser.parse(text);
      const g = root.querySelector("g");
      g.setAttribute("id", charge + "_" + id);
      return g.outerHTML;
    }).catch(error => console.error(error));
  return fetched;
}

function getSizeMod(size) {
  if (size === "small") return .5;
  if (size === "smaller") return .25;
  if (size === "smallest") return .125;
  if (size === "big") return 2;
  return 1;
}

function getTemplate(templateId, lineId) {
  const {lines, templates} = require("./templates");
  if (!lineId) return templates[templateId]();
  const line = lines[lineId] || lines.straight;
  return templates[templateId](line);
}

// get charge is string starts with "semy"
function semy(string) {
  const isSemy = /^semy/.test(string);
  if (!isSemy) return false;
  return string.match(/semy_of_(.*?)-/)[1];
}

function logCOAdetails(coa, shield, division, ordinaries, charges) {
  console.log("---------------");
  console.log("Field:", {t1: coa.t1, shield});
  if (division) console.log("Division:", division);
  if (ordinaries.length) ordinaries.forEach(ordinary => console.log("Ordinary:", ordinary));
  if (charges.length) charges.forEach(charge => console.log("Charge:", charge));
}

module.exports = draw;
