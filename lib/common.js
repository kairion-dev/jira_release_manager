/**
 * Remove all duplicates from an array.
 *
 * @param array
 * @returns array
 */
function uniqueArray(array) {
  return array.filter(function (value, index, self) {
    return self.indexOf(value) === index;
  });
}

module.exports.uniqueArray = uniqueArray;
