var express = require('express');
var fs = require('fs-extra');
var async = require('async');
var path = require('path');
var _ = require('lodash');
var sass = require('node-sass');
var debugModule = require('debug');
var webpack = require('webpack');
var MemoryFileSystem = require("memory-fs"); // https://webpack.github.io/docs/node.js-api.html
var debug = debugModule('theme:debug');
var debugScripts = debugModule('theme:scripts');
var debugStyles = debugModule('theme:styles');
var THEME_PACKAGE_FILENAME = "bower.json";
var THEME_PUBLIC_DIRNAME = "public";
var Theme = (function () {
    function Theme(options) {
        var _this = this;
        this.options = options;
        this._router = express.Router();
        // get infos for theme(s)
        this._router.use(function (req, res, next) {
            var themesPath = path.join(req.app.get('views'), _this._options.themes);
            _this.getThemes(themesPath, function (err, themes) {
                debug("themes", themes);
            });
            var themeName = _this._options.theme;
            var themePath = path.join(req.app.get('views'), _this._options.themes, themeName);
            var themePackagePath = path.join(themePath, THEME_PACKAGE_FILENAME);
            var themePublicPath = path.join(themePath, THEME_PUBLIC_DIRNAME);
            fs.readJson(themePackagePath, function (err, themePackage) {
                if (err && err !== null) {
                    debug(err);
                    return next(err);
                }
                var theme = {
                    name: themeName,
                    path: themePath,
                    packagePath: themePackagePath,
                    package: themePackage,
                    publicPath: themePublicPath,
                };
                req['theme'] = theme;
                debug(req['theme']);
                next();
            });
        });
        /**
         * build app.scss file with sass
         * TODO error handling
         * TODO locals: http://stackoverflow.com/a/31656540
         * TODO cache result
         * TODO move this tu custom class?
         */
        this._router.use(function (req, res, next) {
            if (req.path !== '/app.scss') {
                return next();
            }
            debugStyles(req.path);
            var renderFilePath = path.join(req.theme.publicPath, req.path);
            _this.fileExists(renderFilePath, function (err, exists) {
                if (exists !== true || (err && err !== null)) {
                    return next();
                }
                sass.render({
                    file: renderFilePath,
                }, function (err, result) {
                    if (err && err !== null) {
                        return next(err);
                    }
                    debugStyles("send " + req.path);
                    res.set('Content-Type', 'text/css');
                    res.set('Cache-Control', 'max-age=0');
                    return res.send(result.css);
                });
            });
        });
        /**
         * build app.js file with webpack
         * TODO error handling
         * TODO locals
         * TODO cache result
         * TODO check if browserify is better for this job: https://github.com/substack/node-browserify#api-example
         * TODO move this tu custom class?
         */
        this._router.use(function (req, res, next) {
            var locals = {
                test: 'test'
            };
            if (req.path !== '/app.js') {
                return next();
            }
            var renderFilePath = path.join(req.theme.publicPath, req.path);
            debugScripts(req.path, renderFilePath);
            _this.fileExists(renderFilePath, function (err, exists) {
                if (exists !== true || (err && err !== null)) {
                    return next();
                }
                // TODO error handling: https://webpack.github.io/docs/node.js-api.html
                var webpackCompiler = webpack({
                    entry: renderFilePath,
                    output: {
                        path: '/',
                        filename: "app.js"
                    },
                    plugins: [
                        // define locals here
                        new webpack.DefinePlugin({
                            LOCALS: JSON.stringify(locals)
                        })
                    ],
                    module: {
                        loaders: []
                    }
                });
                var mfs = webpackCompiler.outputFileSystem = new MemoryFileSystem();
                webpackCompiler.run(function (err, stats) {
                    if (err && err !== null) {
                        return next(err);
                    }
                    var fileContent = mfs.readFile("/app.js", function (err, fileContent) {
                        if (err && err !== null) {
                            return next(err);
                        }
                        res.set('Content-Type', 'application/javascript');
                        return res.send(fileContent);
                    });
                });
            });
        });
        // render view in theme
        this._router.use(function (req, res, next) {
            debug("view", req.path);
            var renderFilePath = path.join(req.theme.path, req.path + '.jade');
            _this.fileExists(renderFilePath, function (err, exists) {
                if (exists !== true || (err && err !== null)) {
                    return next();
                }
                return res.render(renderFilePath, { title: 'Express' });
            });
        });
        // use index.jade for /
        this._router.get('/', function (req, res, next) {
            res.render(path.join(req['theme'].path, 'index'), { title: 'Express' });
        });
        // set public path in theme
        this._router.use(function (req, res, next) {
            express.static(req.theme.publicPath)(req, res, next);
        });
    }
    Object.defineProperty(Theme.prototype, "options", {
        set: function (options) {
            this._options = options;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Theme.prototype, "router", {
        get: function () {
            return this._router;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Get all valid themes from theme path
     */
    Theme.prototype.fileExists = function (filePath, callback) {
        fs.stat(filePath, function (err, stat) {
            if (err && err !== null) {
                debug(err);
                return callback(err, false);
            }
            if (stat.isFile()) {
                return callback(null, true);
            }
            return callback(null, false);
        });
    };
    /**
     * Get all valid themes from theme path
     */
    Theme.prototype.getThemes = function (themesPath, callback) {
        var _this = this;
        this.getDirs(themesPath, function (error, dirs) {
            if (error) {
                debug("error", error);
                return callback(error);
            }
            debug("getThemes dirs", dirs);
            async.filter(dirs, function (dir, callback) {
                _this.getThemePackage(path.join(themesPath, dir), function (err, packageObj) {
                    if (err && err !== null) {
                        debug("error", err);
                        return callback(false);
                    }
                    return callback(true);
                });
            }, function (results) {
                callback(null, results);
            });
        });
    };
    /**
     * Get theme packageObj of theme dir
     */
    Theme.prototype.getThemePackage = function (dir, callback) {
        var packagePath = path.join(dir, THEME_PACKAGE_FILENAME);
        fs.stat(packagePath, function (err, stat) {
            if (err && err !== null) {
                debug("error", err);
                return callback(err);
            }
            if (!stat.isFile()) {
                return callback(new Error(packagePath + " is not a file!"));
            }
            fs.readJson(packagePath, function (err, packageObj) {
                if (err && err !== null) {
                    debug("error", err);
                    return callback(err);
                }
                if (!_.isString(packageObj.version) || !_.isString(packageObj.name)) {
                    return callback(new Error("theme package file broken!"));
                }
                callback(null, packageObj);
            });
        });
    };
    /**
     * Get all directories within directory
     * @see http://stackoverflow.com/a/18112359/1465919
     */
    Theme.prototype.getDirs = function (rootDir, cb) {
        debug(rootDir);
        fs.readdir(rootDir, function (err, files) {
            var dirs = [];
            if (err && err !== null) {
                debug("error", err);
                return cb(err);
            }
            async.map(files, function (file, callback) {
                if (file[0] === '.') {
                    return callback(null, null);
                }
                var filePath = rootDir + '/' + file;
                fs.stat(filePath, function (err, stat) {
                    if (err && err !== null) {
                        return cb(err);
                    }
                    if (stat.isDirectory()) {
                        return callback(null, file);
                    }
                    return callback(null, null);
                });
            }, function (err, results) {
                if (err && err !== null) {
                    return cb(err);
                }
                async.filter(results, function (file, callback) {
                    callback(file !== null);
                }, function (results) {
                    cb(err, results);
                });
            });
        });
    };
    return Theme;
})();
exports.Theme = Theme;
