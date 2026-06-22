export function statesEqual(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value) {
  return JSON.stringify(sortForCompare(value));
}

function sortForCompare(value) {
  if (Array.isArray(value)) return value.map(sortForCompare);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      if (value[key] !== undefined) result[key] = sortForCompare(value[key]);
      return result;
    }, {});
}
