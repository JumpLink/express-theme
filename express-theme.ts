import * as express from 'express';
import * as fs from 'fs-extra';
import * as async from 'async';
import * as path from 'path';
import * as _ from 'lodash';
import sass = require('node-sass');
import * as debugModule from 'debug';
import * as webpack from 'webpack';

var MemoryFileSystem = require("memory-fs"); // https://webpack.github.io/docs/node.js-api.html

var debug = debugModule('theme:debug');
var debugScripts = debugModule('theme:scripts');
var debugStyles = debugModule('theme:styles');

const THEME_PACKAGE_FILENAME = "bower.json";
const THEME_PUBLIC_DIRNAME = "public";

export interface ThemeOptions {
	/**
	 * themes folder name
	 */
	themes: string;
	/**
	 * current theme name
	 */
	theme: string;
}

interface ThemePackage {
	name: string;
	description?: string;
	version: string;
}

interface ThemeRequestObject {
	name: string;
	path: string;
	packagePath: string;
	package: ThemePackage;
	publicPath: string;
}

interface ThemePackageCallback {
	(
		error?: Error,
		packageObj?: ThemePackage
	): any
}

interface getDirsCallback {
	(
		error?: Error,
		dirs?: string[]
	): any
}

interface booleanCallback {
	(
		error?: Error,
		result?: boolean
	): any
}

interface Requeset extends express.Request {
	theme: ThemeRequestObject
}

export class Theme {
	private _router: express.Router;
	private _options: ThemeOptions;

	set options(options: ThemeOptions) {
		this._options = options;
	}

	get router(): express.Router {
		return this._router;
	}

	constructor(options: ThemeOptions) {
		this.options = options;

		this._router = express.Router();

		// get infos for theme(s)
		this._router.use((req, res, next) => {

			var themesPath = path.join(req.app.get('views'), this._options.themes);

			this.getThemes(themesPath, (err, themes) => {
				debug("themes", themes);
			});

			var themeName = this._options.theme;
			var themePath = path.join(req.app.get('views'), this._options.themes, themeName);
			var themePackagePath = path.join(themePath, THEME_PACKAGE_FILENAME);
			var themePublicPath = path.join(themePath, THEME_PUBLIC_DIRNAME)

			fs.readJson(themePackagePath, (err: Error, themePackage: ThemePackage) => {
				if(err && err !== null) {
					debug(err);
					return next(err);
				}
				var theme:ThemeRequestObject = {
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
		this._router.use((req: Requeset, res, next) => {
			if (req.path !== '/app.scss') {
				return next();
			}
			debugStyles(req.path);
			var renderFilePath = path.join(req.theme.publicPath, req.path);

			this.fileExists(renderFilePath, (err, exists) => {
				if (exists !== true || (err && err !== null)) { return next(); }
				sass.render({
					file: renderFilePath,
				}, (err, result) => {
					if(err && err !== null) { return next(err); }
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
		this._router.use((req: Requeset, res, next) => {

			var locals = {
				test: 'test'
			};

			if (req.path !== '/app.js') { return next(); }
			var renderFilePath = path.join(req.theme.publicPath, req.path);
			debugScripts(req.path, renderFilePath);
			this.fileExists(renderFilePath, (err, exists) => {
				if (exists !== true || (err && err !== null)) { return next(); }
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
						loaders: [

						]
					}
				});
				var mfs = webpackCompiler.outputFileSystem = new MemoryFileSystem();
				webpackCompiler.run(function(err, stats) {
					if(err && err !== null) { return next(err); }
					var fileContent = mfs.readFile("/app.js", (err: Error, fileContent) => {
						if(err && err !== null) { return next(err); }
						res.set('Content-Type', 'application/javascript');
						return res.send(fileContent);
					});
				});
			});
		});

		// render view in theme
		this._router.use((req: Requeset, res, next) => {

			debug("view", req.path);
			var renderFilePath = path.join(req.theme.path, req.path + '.jade');
			this.fileExists(renderFilePath, (err, exists) => {
				if (exists !== true || (err && err !== null)) {
					return next();
				}
				return res.render(renderFilePath, { title: 'Express' });
			});
		});

		// use index.jade for /
		this._router.get('/', (req, res, next) => {
			res.render(path.join(req['theme'].path, 'index'), { title: 'Express' });
		});

		// set public path in theme
		this._router.use((req: Requeset, res, next) => {
			express.static(req.theme.publicPath)(req, res, next);
		});
	}

	/**
	 * Get all valid themes from theme path
	 */
	private fileExists(filePath: string, callback: booleanCallback) {
		fs.stat(filePath, (err, stat) => {
			if (err && err !== null) {
				debug(err);
				return callback(err, false);
			}
			if (stat.isFile()) {
				return callback(null, true);
			}
			return callback(null, false);
		});
	}

	/**
	 * Get all valid themes from theme path
	 */
	private getThemes(themesPath: string, callback: getDirsCallback) {
		this.getDirs(themesPath, (error, dirs) => {
			if (error) {
				debug("error", error);
				return callback(error);
			}
			debug("getThemes dirs", dirs);

			async.filter(dirs, (dir, callback) => {
				this.getThemePackage(path.join(themesPath, dir), (err, packageObj) => {
					if (err && err !== null) {
						debug("error", err);
						return callback(false);
					}
					return callback(true);
				});
			}, (results) => {
				callback(null, results);
			});
		});
	}

	/**
	 * Get theme packageObj of theme dir
	 */
	private getThemePackage(dir: string, callback: ThemePackageCallback) {
		var packagePath = path.join(dir, THEME_PACKAGE_FILENAME);
		fs.stat(packagePath, (err, stat) => {
			if (err && err !== null) {
				debug("error", err);
				return callback(err);
			}

			if (!stat.isFile()) {
				return callback(new Error(packagePath + " is not a file!"));
			}

			fs.readJson(packagePath, (err: Error, packageObj: ThemePackage) => {
				if (err && err !== null) {
					debug("error", err);
					return callback(err);
				}

				if(!_.isString(packageObj.version) || !_.isString(packageObj.name)) {
					return callback(new Error("theme package file broken!"));
				}

				callback(null, packageObj);
			});

		});
	}

	/**
	 * Get all directories within directory
	 * @see http://stackoverflow.com/a/18112359/1465919
	 */
	private getDirs(rootDir: string, cb: getDirsCallback): any {
		debug(rootDir);
		fs.readdir(rootDir, (err: Error, files: string[]) => {
			var dirs: string[] = [];
			if (err && err !== null) {
				debug("error", err);
				return cb(err);
			}
			async.map<string, string>(files, (file, callback) => {
				if (file[0] === '.') {
					return callback(null, null);
				}
				var filePath = rootDir + '/' + file;
				fs.stat(filePath, (err, stat) => {
					if (err && err !== null) {
						return cb(err);
					}
					if (stat.isDirectory()) {
						return callback(null, file);
					}
					return callback(null, null);
				});
			}, (err, results) => {
				if (err && err !== null) {
					return cb(err);
				}
				async.filter(results, (file, callback) => {
					callback(file !== null);
				}, (results) => {
					cb(err, results);
				});
				
			});
		});
	}

}
