/**
 * Returns the object values (since we don't have Object.values() yet - will come in ECMAScript 2017)
 * @param  {[type]} object [description]
 * @return {[type]}        [description]
 */
module.exports.objectValues = function objectValues(object) {
	return Object.keys(object).map((key) => object[key]);
}


/**
 * Transform an array of objects to an object by taking the keys as new ids.
 * Example:
 * 	arr = [ { position: 'cio', name: 'anna' }, { position: 'ceo', name: 'bernd'}, { position: 'cto', name: 'rudolf' } ]
 * 	arrayToObject(arr, 'position') => { 'cio': { position: 'cio', name: 'anna' }, 'ceo': { position: 'ceo', name: 'bernd'}, 'cto': { position: 'cto', name: 'rudolf' } }
 * @param  {[type]} array [description]
 * @param  {[type]} key   [description]
 * @return {[type]}       [description]
 */
module.exports.arrayToObject = function arrayToObject(array, key) {
	return array.reduce((obj, current) => {
		obj[current[key]] = current;
		return obj;
	}, {});
}
