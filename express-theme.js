"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var express = require('express');
var fs = require('fs-extra');
var async = require('async');
var path = require('path');
var _ = require('lodash');
var debugModule = require('debug');
var THEME_PACKAGE_FILENAME = "bower.json";
var THEMES_DIRNAME = "themes";
var THEME_PUBLIC_DIRNAME = "assets";
var THEME_VIEWS_DIRNAME = "views";
var THEME_SCRIPTS_DIRNAME = "scripts";
var THEME_COPNFIG_DIRNAME = "config";
var THEME_STYLES_DIRNAME = "styles";
var Filesystem = (function () {
    function Filesystem(debugname) {
        this.debug = debugModule(debugname);
    }
    /**
     * Get all directories within directory
     * @see http://stackoverflow.com/a/18112359/1465919
     */
    Filesystem.prototype.getDirs = function (rootDir, cb) {
        var _this = this;
        this.debug(rootDir);
        fs.readdir(rootDir, function (err, files) {
            var dirs = [];
            if (err && err !== null) {
                _this.debug("error", err);
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
    /**
     * Get all valid themes from theme path
     */
    Filesystem.prototype.fileExists = function (filePath, callback) {
        var _this = this;
        fs.stat(filePath, function (err, stat) {
            if (err && err !== null) {
                _this.debug(err);
                return callback(err, false);
            }
            if (stat.isFile()) {
                return callback(null, true);
            }
            return callback(null, false);
        });
    };
    Filesystem.prototype.readJson = function (dir, cb) {
        // this.debug('transform variables.json');
        this.fileExists(dir, function (err, exists) {
            if (exists !== true) {
                return cb(new Error(dir + " Not Found"));
            }
            if (err && err !== null) {
                return cb(err);
            }
            fs.readJson(dir, function (err, data) {
                if (err && err !== null) {
                    return cb(err, {});
                }
                return cb(null, data);
            });
        });
    };
    return Filesystem;
}());
exports.Filesystem = Filesystem;
var Styles = (function (_super) {
    __extends(Styles, _super);
    function Styles() {
        _super.call(this, 'theme:styles');
        this.sass = require('node-sass');
    }
    /**
     * build app.scss file with sass
     * TODO error handling
     * TODO locals: http://stackoverflow.com/a/31656540
     * TODO cache result
     * TODO move this tu custom class?
     */
    Styles.prototype.render = function (req, res, next) {
        var _this = this;
        var renderFilePath = path.join(req.theme.path, req.path);
        this.fileExists(renderFilePath, function (err, exists) {
            if (exists !== true || (err && err !== null)) {
                return next(err);
            }
            fs.readFile(renderFilePath, 'utf8', function (err, scss_string) {
                if (err && err !== null) {
                    return next(err);
                }
                _this.settings(req, function (err, scss_vars_string) {
                    if (err && err !== null) {
                        return next(err);
                    }
                    _this.sass.render({
                        data: scss_vars_string + scss_string,
                        includePaths: [
                            path.join(req.theme.publicPath, THEME_STYLES_DIRNAME),
                        ],
                    }, function (err, result) {
                        if (err && err !== null) {
                            return next(err);
                        }
                        _this.debug("send " + req.path);
                        res.set('Content-Type', 'text/css');
                        res.set('Cache-Control', 'max-age=0');
                        return res.send(result.css);
                    });
                });
            });
        });
    };
    Styles.prototype.settings = function (req, cb) {
        var scss_string = '';
        for (var key in req.theme.settings) {
            scss_string += '$' + key + ': ' + req.theme.settings[key] + ';\n';
        }
        this.debug(scss_string);
        return cb(null, scss_string);
    };
    return Styles;
}(Filesystem));
exports.Styles = Styles;
var Scripts = (function (_super) {
    __extends(Scripts, _super);
    function Scripts() {
        _super.call(this, 'theme:scripts');
        this.browserify = require('browserify-middleware');
    }
    /**
     * build app.js file with browserify
     * TODO error handling
     * TODO cache result
     * TODO move this tu custom class?
     * @see https://github.com/ForbesLindesay/browserify-middleware
     */
    Scripts.prototype.render = function (req, res, next) {
        this.debug(req.path);
        var renderFilePath = path.join(req.theme.path, req.path);
        this.debug(renderFilePath);
        var options = {};
        this.browserify(renderFilePath, options)(req, res, next);
    };
    Scripts.prototype.settings = function (req, res, next) {
        return res.json(req.theme.settings);
    };
    return Scripts;
}(Filesystem));
exports.Scripts = Scripts;
var Views = (function (_super) {
    __extends(Views, _super);
    function Views() {
        _super.call(this, 'theme:views');
    }
    Views.prototype.render = function (req, res, next) {
        this.debug(req.path);
        var renderFilePath = path.join(req.theme.path, THEME_VIEWS_DIRNAME, req.path + '.jade');
        this.fileExists(renderFilePath, function (err, exists) {
            if (exists !== true || (err && err !== null)) {
                return next();
            }
            return res.render(renderFilePath, { title: 'Express' });
        });
    };
    ;
    return Views;
}(Filesystem));
exports.Views = Views;
var Theme = (function (_super) {
    __extends(Theme, _super);
    function Theme(options) {
        var _this = this;
        _super.call(this, 'theme:theme');
        this._router = express.Router();
        this.scripts = new Scripts();
        this.views = new Views();
        this.styles = new Styles();
        this.strformat = require('strformat');
        this.options = options;
        // get infos for theme(s)
        this._router.use(function (req, res, next) {
            _this.setInfo(req, res, next);
        });
        /**
         * render style file
         */
        this._router.get('/' + THEME_PUBLIC_DIRNAME + '/' + THEME_STYLES_DIRNAME + '/app.scss', function (req, res, next) {
            return _this.styles.render(req, res, next);
        });
        /**
         * render script file
         */
        this._router.get('/' + THEME_PUBLIC_DIRNAME + '/' + THEME_SCRIPTS_DIRNAME + '/app.js', function (req, res, next) {
            return _this.scripts.render(req, res, next);
        });
        /**
         * render settings.json file
         */
        this._router.get('/' + THEME_PUBLIC_DIRNAME + '/' + THEME_SCRIPTS_DIRNAME + '/settings.json', function (req, res, next) {
            return _this.scripts.settings(req, res, next);
        });
        /**
         * set public path for theme
         */
        this._router.use('/' + THEME_PUBLIC_DIRNAME, function (req, res, next) {
            return express.static(req.theme.publicPath)(req, res, next);
        });
        /**
         * render view file
         */
        this._router.use(function (req, res, next) {
            return _this.views.render(req, res, next);
        });
        /**
         * render index.jade file
         */
        this._router.get('/', function (req, res, next) {
            return res.render(path.join(req['theme'].path, 'views', 'index'), { title: 'Express' });
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
    Theme.prototype.getThemes = function (themesPath, callback) {
        var _this = this;
        this.getDirs(themesPath, function (error, dirs) {
            if (error) {
                _this.debug("error", error);
                return callback(error);
            }
            _this.debug("getThemes dirs", dirs);
            async.filter(dirs, function (dir, callback) {
                _this.getPackage(path.join(themesPath, dir), function (err, packageObj) {
                    if (err && err !== null) {
                        _this.debug("error", err);
                        return callback(false);
                    }
                    return callback(true);
                });
            }, function (results) {
                return callback(null, results);
            });
        });
    };
    /**
     * TODO get variable overwrites from db
     * TODO cache file
     */
    Theme.prototype.getSettingsData = function (themePath, cb) {
        var _this = this;
        var settings_data = {};
        // shopify like settings_schema.json file
        var settingsSchemaFilePath = path.join(themePath, THEME_COPNFIG_DIRNAME, 'settings_schema.json');
        this.readJson(settingsSchemaFilePath, function (err, schema) {
            if (err && err !== null) {
                _this.debug(err);
                return cb(err);
            }
            for (var i in schema) {
                if (schema[i].settings) {
                    for (var def in schema[i].settings) {
                        if (schema[i].settings[def].id && typeof (schema[i].settings[def].default) !== 'undefined') {
                            settings_data[schema[i].settings[def].id] = schema[i].settings[def].default;
                        }
                    }
                }
            }
            // replace placeholders
            for (var key in settings_data) {
                if (_.isString(settings_data[key])) {
                    _this.debug("replace placeholder", settings_data[key]);
                    settings_data[key] = _this.strformat(settings_data[key], settings_data);
                }
            }
            return cb(null, settings_data);
        });
    };
    /**
     * Get theme packageObj of theme dir
     */
    Theme.prototype.getPackage = function (dir, callback) {
        var _this = this;
        var packagePath = path.join(dir, THEME_PACKAGE_FILENAME);
        this.readJson(packagePath, function (err, packageObj) {
            if (err && err !== null) {
                _this.debug(err);
                return callback(err);
            }
            if (!_.isString(packageObj.version) || !_.isString(packageObj.name)) {
                return callback(new Error("theme package file broken!"));
            }
            return callback(null, packageObj);
        });
    };
    /**
     * set infos for theme in Request Object
     */
    Theme.prototype.setInfo = function (req, res, next) {
        var _this = this;
        var themesPath = path.join(req.app.get('views'), THEMES_DIRNAME);
        this.getThemes(themesPath, function (err, themes) {
            _this.debug("themes", themes);
        });
        var themeName = this._options.theme;
        var themePath = path.join(req.app.get('views'), THEMES_DIRNAME, themeName);
        var themePublicPath = path.join(themePath, THEME_PUBLIC_DIRNAME);
        this.getSettingsData(themePath, function (err, settingsData) {
            if (err && err !== null) {
                _this.debug(err);
                return next(err);
            }
            _this.getPackage(themePath, function (err, themePackage) {
                if (err && err !== null) {
                    _this.debug(err);
                    return next(err);
                }
                var theme = {
                    name: themeName,
                    path: themePath,
                    settings: settingsData,
                    package: themePackage,
                    publicPath: themePublicPath,
                };
                req['theme'] = theme;
                _this.debug(req['theme']);
                return next();
            });
        });
    };
    return Theme;
}(Filesystem));
exports.Theme = Theme;
