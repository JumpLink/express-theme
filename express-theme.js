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
var nedb = require('nedb');
var THEME_PACKAGE_FILENAME = "bower.json";
var THEME_SETTINGS_SCHEMA_FILENAME = "settings_schema.json";
var THEME_SETTINGS_DATA_FILENAME = "settings_data.json.db";
var THEMES_DIRNAME = "themes";
var THEME_PUBLIC_DIRNAME = "assets";
var THEME_TEMPLATES_DIRNAME = "templates";
var THEME_SCRIPTS_DIRNAME = "scripts";
var THEME_CONFIG_DIRNAME = "config";
var THEME_STYLES_DIRNAME = "styles";
var Filesystem = (function () {
    function Filesystem(debugname) {
        this.readJsonSync = fs.readJsonSync;
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
        var renderFilePath = path.join(req.theme.options.path, req.path);
        this.debug(renderFilePath);
        this.fileExists(renderFilePath, function (err, exists) {
            if (exists !== true) {
                _this.debug("Not Found", renderFilePath, req.path);
                return next();
            }
            if (err && err !== null) {
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
                    var options = {
                        data: scss_vars_string + scss_string,
                        includePaths: [
                            req.theme.options.stylesPath,
                            path.join(req.theme.options.path, 'node_modules')
                        ],
                    };
                    _this.debug(options);
                    _this.sass.render(options, function (err, result) {
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
        var _this = this;
        var scss_string = '';
        req.theme.settings.getData(function (err, data) {
            if (err && err !== null) {
                return cb(err);
            }
            for (var key in data.current) {
                scss_string += '$' + key + ': ' + data.current[key] + ';\n';
            }
            _this.debug(scss_string);
            return cb(null, scss_string);
        });
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
        var renderFilePath = path.join(req.theme.options.path, req.path);
        this.debug(renderFilePath);
        var options = {};
        this.browserify(renderFilePath, options)(req, res, next);
    };
    Scripts.prototype.settings = function (req, res, next) {
        req.theme.settings.getData(function (err, data) {
            if (err && err !== null) {
                next(err);
            }
            return res.json(data.current);
        });
    };
    return Scripts;
}(Filesystem));
exports.Scripts = Scripts;
var Templates = (function (_super) {
    __extends(Templates, _super);
    function Templates() {
        _super.call(this, 'theme:templates');
    }
    Templates.prototype.render = function (req, res, next) {
        var _this = this;
        var renderFilePath = path.join(req.theme.options.templatesPath, req.path + '.jade');
        this.debug(renderFilePath);
        this.fileExists(renderFilePath, function (err, exists) {
            if (exists !== true) {
                _this.debug("Not Found", renderFilePath, req.path);
                return next();
            }
            if (err && err !== null) {
                return next(err);
            }
            req.theme.settings.getData(function (err, data) {
                if (err && err !== null) {
                    return next(err);
                }
                res.render(renderFilePath, { settings: data.current });
            });
        });
    };
    ;
    return Templates;
}(Filesystem));
exports.Templates = Templates;
var Settings = (function (_super) {
    __extends(Settings, _super);
    function Settings(options) {
        _super.call(this, 'theme:settings');
        this.options = options;
        this.strformat = require('strformat');
        this.db = new nedb({ filename: this.options.settingsDataPath, autoload: true });
    }
    Object.defineProperty(Settings.prototype, "presets", {
        /**
         * Get presents part of shopify like settings_data.json file
         * TODO get variable overwrites from db
         * TODO cache file
         * @see https://docs.shopify.com/themes/theme-development/storefront-editor/settings-schema
         */
        get: function () {
            var presets = {
                'Default': {}
            };
            var schema = this.readJsonSync(this.options.settingsSchemaPath);
            for (var i in schema) {
                if (schema[i].settings) {
                    for (var def in schema[i].settings) {
                        if (schema[i].settings[def].id && typeof (schema[i].settings[def].default) !== 'undefined') {
                            presets['Default'][schema[i].settings[def].id] = schema[i].settings[def].default;
                        }
                    }
                }
            }
            // replace placeholders
            for (var key in presets['Default']) {
                if (_.isString(presets['Default'][key])) {
                    this.debug("replace placeholder", presets['Default'][key]);
                    presets['Default'][key] = this.strformat(presets['Default'][key], presets['Default']);
                }
            }
            return presets;
        },
        enumerable: true,
        configurable: true
    });
    Settings.prototype.getCurrent = function () {
    };
    Settings.prototype.getData = function (cb) {
        var _this = this;
        this.debug('getData');
        this.db.find({}, function (err, data) {
            if (err && err !== null) {
                _this.debug(err);
                return cb(err, data);
            }
            _this.debug(data);
            // overwrite presets result from settings_schema.json file
            data.presets = _this.presets;
            if (!data.current) {
                data.current = {};
            }
            for (var key in data.presets['Default']) {
                // if new value comes from schema, injet it to current
                if (!data.current.hasOwnProperty(key)) {
                    data.current[key] = data.presets['Default'][key];
                }
            }
            return cb(err, data);
        });
    };
    return Settings;
}(Filesystem));
exports.Settings = Settings;
var Theme = (function (_super) {
    __extends(Theme, _super);
    function Theme(options) {
        var _this = this;
        _super.call(this, 'theme:theme');
        this.router = express.Router();
        this.scripts = new Scripts();
        this.templates = new Templates();
        this.styles = new Styles();
        this.options = options;
        this.package = this.getPackageSync(this.options.packagePath);
        this.settings = new Settings(this.options);
        // inject theme stuff to request
        this.router.use(function (req, res, next) {
            _this.setRequest(req, res, next);
        });
        /**
         * render style file
         */
        this.router.get('/' + THEME_PUBLIC_DIRNAME + '/' + THEME_STYLES_DIRNAME + '/app.scss', function (req, res, next) {
            _this.debug('styles', req.path);
            return _this.styles.render(req, res, next);
        });
        /**
         * render script file
         */
        this.router.get('/' + THEME_PUBLIC_DIRNAME + '/' + THEME_SCRIPTS_DIRNAME + '/app.js', function (req, res, next) {
            _this.debug('scripts', req.path);
            return _this.scripts.render(req, res, next);
        });
        /**
         * render settings.json file
         */
        this.router.get('/' + THEME_PUBLIC_DIRNAME + '/' + THEME_SCRIPTS_DIRNAME + '/settings.json', function (req, res, next) {
            _this.debug('settings.json');
            return _this.scripts.settings(req, res, next);
        });
        /**
         * set public path for theme
         */
        this.router.use('/' + THEME_PUBLIC_DIRNAME, function (req, res, next) {
            _this.debug('public');
            return express.static(req.theme.options.publicPath)(req, res, next);
        });
        /**
         * render view file
         */
        this.router.use(function (req, res, next) {
            return _this.templates.render(req, res, next);
        });
        /**
         * render index.jade file
         */
        this.router.get('/', function (req, res, next) {
            return res.render(path.join(req.theme.options.templatesPath, 'index'), { title: 'Express' });
        });
        this.router.use(function (err, req, res, next) {
            _this.debug(req.path, err);
            res.status(500).send(req.path + '\n' + err);
        });
    }
    Object.defineProperty(Theme.prototype, "options", {
        get: function () {
            return this._options;
        },
        set: function (options) {
            this._options = options;
            this._options.themesPath = path.join(this._options.viewsPath, THEMES_DIRNAME);
            this._options.path = path.join(this._options.themesPath, this._options.dirname);
            this._options.packagePath = path.join(this._options.path, THEME_PACKAGE_FILENAME);
            this._options.publicPath = path.join(this._options.path, THEME_PUBLIC_DIRNAME);
            this._options.configPath = path.join(this._options.path, THEME_CONFIG_DIRNAME);
            this._options.scriptsPath = path.join(this._options.path, THEME_SCRIPTS_DIRNAME);
            this._options.stylesPath = path.join(this._options.path, THEME_STYLES_DIRNAME);
            this._options.templatesPath = path.join(this._options.path, THEME_TEMPLATES_DIRNAME);
            this._options.settingsSchemaPath = path.join(this._options.configPath, THEME_SETTINGS_SCHEMA_FILENAME);
            this._options.settingsDataPath = path.join(this._options.configPath, THEME_SETTINGS_DATA_FILENAME);
            this.debug(this._options);
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
     * Get theme packageObj of theme dir
     */
    Theme.prototype.getPackage = function (dir, callback) {
        var _this = this;
        this.readJson(dir, function (err, packageObj) {
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
     * Syncronius version of getPackage
     */
    Theme.prototype.getPackageSync = function (dir) {
        var packageObj = this.readJsonSync(dir);
        if (!_.isString(packageObj.version) || !_.isString(packageObj.name)) {
            throw new Error("theme package file broken!");
        }
        return packageObj;
    };
    /**
     * set request IThemeRequestObject for theme in Request Object
     */
    Theme.prototype.setRequest = function (req, res, next) {
        var theme = {
            options: this.options,
            settings: this.settings,
            package: this.package,
        };
        req.theme = theme;
        return next();
    };
    return Theme;
}(Filesystem));
exports.Theme = Theme;
