# npmd-resolve

npmd dependency tree resolution.

given an [npmd](https://github.com/dominictarr/npmd)
database full of npm package.jsons,
resolve the dependency tree for a module & version.

## example

``` js
var resolve = require('npmd-resolve')
resolve(db.sublevel('ver'), 'browserify', '2', 
  {greedy: true}, function (err, tree) {
    console.error(tree)
  })
```

## data format:

`npmd-resolve` assumes a leveldb of package.json's with format:

`package.name + '!' +  paddedSemver(package.version) : package`

padded semver converts semver into strings that are bytewise sorted.

## greedy mode

If `{greedy: true}` is enabled,
resolve will build a dependency tree that is deduplicated by default.

## License

MIT
