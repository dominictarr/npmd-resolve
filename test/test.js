

var tape = require('tape')

var createResolve = require('../resolve-tree')
var semver = require('semver')

var registry = {
  foo: {
    '1.0.0': {
      name: 'foo', version: '1.0.0',
      dependencies: {bar: '1'}
    }
  },
  bar: {
    '1.0.0': {
      name: 'bar', version: '1.0.0',
      dependencies: {foo: '1'}
    }
  },
  baz: {
    '1.7.5': {
      name: 'baz', version: '1.7.5'
    }
  }
}


function fakeResolve (m, v, opts, cb) {
  var deps = registry[m]
  var versions = Object.keys(deps)
  var version = semver.maxSatisfying(versions, v, true)
  console.log(version, v, versions)
  setImmediate(function () {
    cb(null, JSON.parse(JSON.stringify(deps[version])))
  })
}

var resolve = createResolve(fakeResolve)


//resolve('foo', {}, console.log)

tape('resolves circular deps', function (t) {
  resolve('foo', {}, function (err, tree) {
    t.notOk(err)
    t.ok(tree)
    t.end()
  })
})


tape('resolves old range', function (t) {

  resolve('baz@>=1.6.2 && <2', {}, function (err, tree) {
    t.notOk(err)
    t.equal(tree.name, 'baz')
    t.equal(tree.version, '1.7.5')
    t.end()
  })
})
