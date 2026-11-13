"use strict";

function parseGedcom(text) {
  const individuals = new Map();
  const families = new Map();
  let current = null;

  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^0(?:\s|$)/.test(line)) {
      current = null;
      const record = line.match(/^0\s+(@[^@]+@)\s+(INDI|FAM)\b/);
      if (!record) continue;
      current = record[2] === "INDI"
        ? { type: "INDI", id: record[1], name: "", lastName: "", sex: "", famc: [], fams: [] }
        : { type: "FAM", id: record[1], husband: "", wife: "", children: [] };
      (current.type === "INDI" ? individuals : families).set(current.id, current);
      continue;
    }

    if (!current) continue;

    const field = line.match(/^1\s+(\w+)(?:\s+(.*))?$/);
    if (!field) continue;
    const [, tag, value = ""] = field;

    if (current.type === "INDI") {
      if (tag === "NAME") {
        current.name = value.replaceAll("/", "").replace(/\s+/g, " ").trim();
        current.lastName = value.match(/\/([^/]*)\//)?.[1].trim() || "";
      }
      if (tag === "SEX") current.sex = value.trim();
      if (tag === "FAMC") current.famc.push(value.trim());
      if (tag === "FAMS") current.fams.push(value.trim());
    } else {
      if (tag === "HUSB") current.husband = value.trim();
      if (tag === "WIFE") current.wife = value.trim();
      if (tag === "CHIL") current.children.push(value.trim());
    }
  }

  return { individuals, families };
}

const exampleGedcom = `0 HEAD
1 SOUR 3D Family example
0 @I1@ INDI
1 NAME Sam /Example/
1 SEX X
1 FAMC @F1@
0 @I2@ INDI
1 NAME Alex /Example/
1 SEX X
1 FAMS @F1@
0 @I3@ INDI
1 NAME Jamie /Example/
1 SEX X
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
0 TRLR`;

function relativesOf(center, individuals, families) {
  const parents = new Set();
  const siblings = new Set();
  const spouses = new Set();
  const children = new Set();
  const grandparents = new Set();
  const grandchildren = new Set();

  for (const familyId of center.famc) {
    const family = families.get(familyId);
    if (!family) continue;
    if (family.husband) parents.add(family.husband);
    if (family.wife) parents.add(family.wife);
    for (const childId of family.children) {
      if (childId !== center.id) siblings.add(childId);
    }
  }

  for (const familyId of center.fams) {
    const family = families.get(familyId);
    if (!family) continue;
    for (const partnerId of [family.husband, family.wife]) {
      if (partnerId && partnerId !== center.id) spouses.add(partnerId);
    }
    for (const childId of family.children) {
      if (childId !== center.id) children.add(childId);
    }
  }

  const people = (ids) => [...ids]
    .map((id) => individuals.get(id))
    .filter(Boolean);
  const directIds = new Set([center.id, ...parents, ...siblings, ...spouses, ...children]);
  const secondIds = new Set();
  const addSecondDegree = (ids) => people(ids)
    .filter((person) => !directIds.has(person.id) && !secondIds.has(person.id))
    .filter((person) => secondIds.add(person.id));

  for (const parent of people(parents)) {
    for (const familyId of parent.famc) {
      const family = families.get(familyId);
      if (!family) continue;
      if (family.husband) grandparents.add(family.husband);
      if (family.wife) grandparents.add(family.wife);
    }
  }

  for (const child of people(children)) {
    for (const familyId of child.fams) {
      const family = families.get(familyId);
      if (family) family.children.forEach((id) => grandchildren.add(id));
    }
  }

  return {
    parents: people(parents),
    siblings: people(siblings),
    spouses: people(spouses),
    children: people(children),
    grandparents: addSecondDegree(grandparents),
    grandchildren: addSecondDegree(grandchildren)
  };
}
