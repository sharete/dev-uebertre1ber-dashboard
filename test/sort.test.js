const assert = require('assert');

function sortStrings(arr, asc = true) {
  const copy = arr.slice();
  copy.sort((a, b) => {
    let aVal = a.toLowerCase();
    let bVal = b.toLowerCase();
    return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
  });
  return copy;
}

// Ascending sort
let result = sortStrings(['banana', 'Apple', 'cherry']);
assert.deepStrictEqual(result, ['Apple', 'banana', 'cherry'], 'ascending sort failed');

// Descending sort
result = sortStrings(['banana', 'Apple', 'cherry'], false);
assert.deepStrictEqual(result, ['cherry', 'banana', 'Apple'], 'descending sort failed');

console.log('All tests passed.');
