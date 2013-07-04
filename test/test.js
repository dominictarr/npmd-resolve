
var leaves = require('../leaves')
var depTree = require('./fixtures/npmd-resolved.json')
var leafHashes = require('./fixtures/npmd-leaves.json')
var test = require('tape')

test('leaves converts to leaf first, with hashes', function (t) {
  //console.log(JSON.stringify(leaves(depTree), null, 2))
  t.deepEqual(leaves(depTree), leafHashes)
  t.end()
})

