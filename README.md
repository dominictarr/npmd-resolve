# npmd-resolve

npmd dependency tree resolution.

given an [npmd](https://github.com/dominictarr/npmd)
database full of npm package.jsons,
resolve the dependency tree for a module & version.

If a leveldb is not provided, npmd-resolve will resolve by looking in your `~/.npm/`
cache, or querying the npm registry, if you provide the `{online: true}` option.

## example

``` js
var resolve = require('npmd-resolve')
//versionSublevel, moduleName, moduleVersion, config
resolve(db.sublevel('ver'), 'browserify', '2', 
  {greedy: true}, function (err, tree) {
    console.error(tree)
  })
```

## UNIX

``` js
npm install -g npmd-resolve npmd-install
# then
npmd-resolve browserify | npmd-install
# or
npmd-resolve browserify --online | npmd-install
```

## Usage

``` js
npmd-resolve module@ver,...   # resolve specific modules
npmd-resolve < package.json   # resolve all deps for this package.json
npmd-resolve                  # resolve all deps for current directory
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

